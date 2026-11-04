package crypto

import (
	"bytes"
	"context"
	"testing"
)

func newTestEncryptor() *LocalEncryptor {
	return NewLocalEncryptor(bytes.Repeat([]byte{7}, 32))
}

func TestLocalEncryptorRoundTrip(t *testing.T) {
	e := newTestEncryptor()
	ctx := context.Background()
	plain := []byte(`[{"column":"dx","value":"J45.909"}]`)

	blob, err := e.Encrypt(ctx, plain)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(blob, plain) {
		t.Fatal("ciphertext contains the plaintext")
	}
	got, err := e.Decrypt(ctx, blob)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, plain) {
		t.Fatalf("got %q, want %q", got, plain)
	}
}

func TestLocalEncryptorUsesFreshNonces(t *testing.T) {
	e := newTestEncryptor()
	a, _ := e.Encrypt(context.Background(), []byte("same"))
	b, _ := e.Encrypt(context.Background(), []byte("same"))
	if bytes.Equal(a, b) {
		t.Fatal("encrypting the same plaintext twice produced identical blobs")
	}
}

func TestLocalEncryptorRejectsTampering(t *testing.T) {
	e := newTestEncryptor()
	blob, _ := e.Encrypt(context.Background(), []byte("secret"))
	blob[len(blob)-1] ^= 1
	if _, err := e.Decrypt(context.Background(), blob); err == nil {
		t.Fatal("tampered blob decrypted without error")
	}
}

func TestLocalEncryptorRejectsWrongKey(t *testing.T) {
	blob, _ := newTestEncryptor().Encrypt(context.Background(), []byte("secret"))
	other := NewLocalEncryptor(bytes.Repeat([]byte{8}, 32))
	if _, err := other.Decrypt(context.Background(), blob); err == nil {
		t.Fatal("blob decrypted under a different key")
	}
}

func TestLocalEncryptorRejectsShortBlob(t *testing.T) {
	if _, err := newTestEncryptor().Decrypt(context.Background(), []byte{1, 2, 3}); err == nil {
		t.Fatal("short blob accepted")
	}
}
