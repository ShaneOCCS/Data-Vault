// Package crypto provides at-rest encryption for everything the schema
// marks as sensitive (TOTP secrets, medical record content). It exposes one
// interface, Encryptor, with two implementations so the rest of the
// codebase never has to know or care which one is active — handlers and the
// store package hold an Encryptor, not a *LocalEncryptor or *KMSEncryptor.
package crypto

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/kms"
)

// Encryptor is implemented by both LocalEncryptor (dev) and KMSEncryptor
// (production). Callers pass plain bytes in and get an opaque encrypted
// blob back — the internal format (nonce placement, key wrapping) is each
// implementation's own business, never the caller's.
type Encryptor interface {
	Encrypt(ctx context.Context, plaintext []byte) ([]byte, error)
	Decrypt(ctx context.Context, blob []byte) ([]byte, error)
}

// --- LocalEncryptor: AES-256-GCM with a static key from the environment ---
//
// This is dev/synthetic-data only. It exists so a developer can run the
// full stack without an AWS account. config.Load() refuses to start the
// server with this encryptor selected while APP_ENV=production (invariant
// #8), so its use in front of real patient data is a code-level
// impossibility, not a policy someone has to remember to enforce.
type LocalEncryptor struct {
	key []byte // exactly 32 bytes, validated by config.Load()
}

// NewLocalEncryptor builds a LocalEncryptor from a validated 32-byte key.
func NewLocalEncryptor(key []byte) *LocalEncryptor {
	return &LocalEncryptor{key: key}
}

// Encrypt seals plaintext with AES-GCM under a fresh random nonce, and
// prepends that nonce to the output so Decrypt can recover it — GCM nonces
// must never repeat under the same key, and storing it alongside the
// ciphertext is the standard way to guarantee that without extra state.
func (e *LocalEncryptor) Encrypt(_ context.Context, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(e.key)
	if err != nil {
		return nil, fmt.Errorf("crypto: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypto: new gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("crypto: read nonce: %w", err)
	}
	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

// Decrypt reverses Encrypt: split the leading nonce off the blob, then open
// the remainder as an AES-GCM ciphertext.
func (e *LocalEncryptor) Decrypt(_ context.Context, blob []byte) ([]byte, error) {
	block, err := aes.NewCipher(e.key)
	if err != nil {
		return nil, fmt.Errorf("crypto: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypto: new gcm: %w", err)
	}
	nonceSize := gcm.NonceSize()
	if len(blob) < nonceSize {
		return nil, fmt.Errorf("crypto: ciphertext too short")
	}
	nonce, ciphertext := blob[:nonceSize], blob[nonceSize:]
	return gcm.Open(nil, nonce, ciphertext, nil)
}

// --- KMSEncryptor: envelope encryption backed by a single AWS KMS CMK ---
//
// Encrypting every record directly with KMS would mean a network round trip
// per row; instead we ask KMS for one fresh AES data key per encryption
// call, use it locally for the actual AES-GCM work, then store the
// KMS-wrapped copy of that data key alongside the ciphertext so Decrypt can
// ask KMS to unwrap it later. This is the standard "envelope encryption"
// pattern and is why the CMK's IAM policy only needs to allow
// GenerateDataKey and Decrypt — it never sees plaintext record data.
type KMSEncryptor struct {
	client *kms.Client
	keyID  string // CMK ARN or alias
}

// NewKMSEncryptor builds a KMSEncryptor bound to one CMK. The EC2 instance
// profile must grant kms:GenerateDataKey and kms:Decrypt on exactly this
// key's ARN — see the "Deployment" section of the project spec.
func NewKMSEncryptor(client *kms.Client, keyID string) *KMSEncryptor {
	return &KMSEncryptor{client: client, keyID: keyID}
}

// blobLayout: [4-byte big-endian len(wrappedKey)][wrappedKey][nonce][ciphertext||tag]
// The length prefix lets Decrypt split a variable-length wrapped key back
// out without needing a delimiter that could collide with binary data.
const wrappedKeyLenSize = 4

// Encrypt requests a fresh data key from KMS, uses its plaintext copy to
// AES-GCM seal the payload, and returns the wrapped key + nonce +
// ciphertext concatenated per blobLayout. The plaintext data key is never
// persisted or logged — it lives only in this function's stack.
func (e *KMSEncryptor) Encrypt(ctx context.Context, plaintext []byte) ([]byte, error) {
	out, err := e.client.GenerateDataKey(ctx, &kms.GenerateDataKeyInput{
		KeyId:   aws.String(e.keyID),
		KeySpec: "AES_256",
	})
	if err != nil {
		return nil, fmt.Errorf("crypto: kms generate data key: %w", err)
	}
	dataKey := out.Plaintext
	wrappedKey := out.CiphertextBlob

	block, err := aes.NewCipher(dataKey)
	if err != nil {
		return nil, fmt.Errorf("crypto: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypto: new gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("crypto: read nonce: %w", err)
	}
	sealed := gcm.Seal(nonce, nonce, plaintext, nil)

	lenPrefix := make([]byte, wrappedKeyLenSize)
	binary.BigEndian.PutUint32(lenPrefix, uint32(len(wrappedKey)))

	blob := make([]byte, 0, wrappedKeyLenSize+len(wrappedKey)+len(sealed))
	blob = append(blob, lenPrefix...)
	blob = append(blob, wrappedKey...)
	blob = append(blob, sealed...)
	return blob, nil
}

// Decrypt splits the wrapped key back out of blob, asks KMS to unwrap it,
// then opens the AES-GCM payload with the recovered plaintext data key.
func (e *KMSEncryptor) Decrypt(ctx context.Context, blob []byte) ([]byte, error) {
	if len(blob) < wrappedKeyLenSize {
		return nil, fmt.Errorf("crypto: blob too short for length prefix")
	}
	wrappedKeyLen := binary.BigEndian.Uint32(blob[:wrappedKeyLenSize])
	rest := blob[wrappedKeyLenSize:]
	if uint32(len(rest)) < wrappedKeyLen {
		return nil, fmt.Errorf("crypto: blob too short for wrapped key")
	}
	wrappedKey := rest[:wrappedKeyLen]
	sealed := rest[wrappedKeyLen:]

	out, err := e.client.Decrypt(ctx, &kms.DecryptInput{
		CiphertextBlob: wrappedKey,
		KeyId:          aws.String(e.keyID),
	})
	if err != nil {
		return nil, fmt.Errorf("crypto: kms decrypt data key: %w", err)
	}
	dataKey := out.Plaintext

	block, err := aes.NewCipher(dataKey)
	if err != nil {
		return nil, fmt.Errorf("crypto: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypto: new gcm: %w", err)
	}
	nonceSize := gcm.NonceSize()
	if len(sealed) < nonceSize {
		return nil, fmt.Errorf("crypto: ciphertext too short")
	}
	nonce, ciphertext := sealed[:nonceSize], sealed[nonceSize:]
	return gcm.Open(nil, nonce, ciphertext, nil)
}
