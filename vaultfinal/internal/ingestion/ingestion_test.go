package ingestion

import (
	"reflect"
	"strings"
	"testing"
)

func TestFilenameMatchesKitID(t *testing.T) {
	cases := []struct {
		filename, kitID string
		want            bool
	}{
		{"AB3CD7K.csv", "AB3CD7K", true},
		{"AB3CD7K.CSV", "AB3CD7K", true},
		{"AB3CD7K.csv", "ZZZZZZZ", false},
		{"AB3CD7K.txt", "AB3CD7K", false},
		{"AB3CD7K", "AB3CD7K", false},
		{"ab3cd7k.csv", "AB3CD7K", false},
		{"AB3CD7K.csv.csv", "AB3CD7K", false},
		{"other_AB3CD7K.csv", "AB3CD7K", false},
	}
	for _, tc := range cases {
		if got := FilenameMatchesKitID(tc.filename, tc.kitID); got != tc.want {
			t.Errorf("FilenameMatchesKitID(%q, %q) = %v, want %v", tc.filename, tc.kitID, got, tc.want)
		}
	}
}

func TestProcessCSVKeepsOrderAndHandlesRaggedRows(t *testing.T) {
	in := "date,code,note\n" +
		"2026-01-01,J45,stable\n" +
		"2026-02-01,E11\n" + // short row
		"2026-03-01,I10,ok,extra\n" // long row
	rows, err := ProcessCSV(strings.NewReader(in))
	if err != nil {
		t.Fatal(err)
	}
	want := [][]Field{
		{{"date", "2026-01-01"}, {"code", "J45"}, {"note", "stable"}},
		{{"date", "2026-02-01"}, {"code", "E11"}},
		{{"date", "2026-03-01"}, {"code", "I10"}, {"note", "ok"}, {"col_4", "extra"}},
	}
	if !reflect.DeepEqual(rows, want) {
		t.Fatalf("got %+v\nwant %+v", rows, want)
	}
}

func TestProcessCSVHeaderOnly(t *testing.T) {
	rows, err := ProcessCSV(strings.NewReader("a,b\n"))
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 0 {
		t.Fatalf("got %d rows, want 0", len(rows))
	}
}

func TestProcessCSVErrors(t *testing.T) {
	if _, err := ProcessCSV(strings.NewReader("")); err == nil {
		t.Fatal("empty input accepted")
	}
	if _, err := ProcessCSV(strings.NewReader("a,b\n\"unterminated,x\n")); err == nil {
		t.Fatal("malformed quoting accepted")
	}
}

func TestEncodeDecodeRoundTrip(t *testing.T) {
	fields := []Field{{"z", "1"}, {"a", "2"}, {"m", "with \"quotes\", commas"}}
	blob, err := EncodeRow(fields)
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeRow(blob)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, fields) {
		t.Fatalf("got %+v, want %+v", got, fields)
	}
	if _, err := DecodeRow([]byte("not json")); err == nil {
		t.Fatal("garbage decoded")
	}
}
