// Package ingestion turns an admin-uploaded CSV of unknown shape into a
// list of per-row field lists ready to be JSON-encoded and encrypted by the
// caller. It never touches the database or crypto directly — handlers/admin.go
// owns encrypting each row and calling store.InsertMedicalRecord.
package ingestion

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"strings"
)

// MaxCSVUploadBytes caps how large one ingestion request body can be. 25MB
// comfortably fits a large single-member record export while still
// bounding how much memory one malicious or mistaken upload can force the
// server to hold — wrap the request body in http.MaxBytesReader with this
// limit before handing it to ProcessCSV.
const MaxCSVUploadBytes = 25 * 1024 * 1024

// Field is one (column name, value) pair from a CSV row, kept as an
// ordered slice (not a map) so column order round-trips exactly when a
// member later views their record.
type Field struct {
	Column string `json:"column"`
	Value  string `json:"value"`
}

// FilenameMatchesKitID reports whether filename is exactly "<kitID>.csv"
// (extension case-insensitive). This is the mis-link guard described in
// claude.md's "CSV ingestion" section: an admin pasting the wrong file into
// the wrong ingest request gets rejected instead of silently attaching
// someone else's records to the wrong member.
func FilenameMatchesKitID(filename, kitID string) bool {
	ext := filepath.Ext(filename)
	if !strings.EqualFold(ext, ".csv") {
		return false
	}
	base := strings.TrimSuffix(filepath.Base(filename), ext)
	return base == kitID
}

// ProcessCSV reads a CSV of unknown, unvalidated column layout and returns
// one []Field per data row (the header row is consumed, not returned).
// Rows are tolerated even if ragged (more or fewer values than the header
// has columns) — a real-world medical records export is exactly the kind
// of CSV that doesn't always have a clean rectangular shape, and rejecting
// the whole batch over one short row would be worse than tagging the extra
// or missing values sensibly.
func ProcessCSV(r io.Reader) ([][]Field, error) {
	cr := csv.NewReader(r)
	cr.FieldsPerRecord = -1 // disable the default "every row must match the header's column count" check

	header, err := cr.Read()
	if err != nil {
		return nil, fmt.Errorf("ingestion: read header: %w", err)
	}

	var rows [][]Field
	for {
		record, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("ingestion: read row %d: %w", len(rows)+1, err)
		}

		fields := make([]Field, len(record))
		for i, value := range record {
			column := fmt.Sprintf("col_%d", i+1) // fallback name for a value beyond the header's width
			if i < len(header) {
				column = header[i]
			}
			fields[i] = Field{Column: column, Value: value}
		}
		rows = append(rows, fields)
	}
	return rows, nil
}

// EncodeRow JSON-encodes one row's ordered fields into the blob that gets
// encrypted and stored in medical_records.content_enc. Encoding happens
// here (rather than inline in the handler) so the exact wire format is
// defined in one place and GetRecord can decode it the same way.
func EncodeRow(fields []Field) ([]byte, error) {
	b, err := json.Marshal(fields)
	if err != nil {
		return nil, fmt.Errorf("ingestion: encode row: %w", err)
	}
	return b, nil
}

// DecodeRow reverses EncodeRow, used when a member reads back a record.
func DecodeRow(blob []byte) ([]Field, error) {
	var fields []Field
	if err := json.Unmarshal(blob, &fields); err != nil {
		return nil, fmt.Errorf("ingestion: decode row: %w", err)
	}
	return fields, nil
}
