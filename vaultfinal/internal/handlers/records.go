package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"vaultfinal/internal/ingestion"
	"vaultfinal/internal/store"
)

type recordMetaResponse struct {
	ID          int64  `json:"id"`
	RowIndex    int    `json:"rowIndex"`
	SourceBatch string `json:"sourceBatch"`
	CreatedAt   string `json:"createdAt"`
}

// ListRecords returns metadata only (no decrypted content) for every
// record belonging to the session's own KIT ID — kitIDFromContext, not any
// request parameter, is what scopes this query, so there is no way to ask
// for another member's list.
func (s *Server) ListRecords(w http.ResponseWriter, r *http.Request) {
	kitID := kitIDFromContext(r.Context())
	records, err := s.Store.ListRecordsForMember(r.Context(), kitID)
	if err != nil {
		serverError(w)
		return
	}

	out := make([]recordMetaResponse, len(records))
	for i, rec := range records {
		out[i] = recordMetaResponse{
			ID:          rec.ID,
			RowIndex:    rec.RowIndex,
			SourceBatch: rec.SourceBatch.String(),
			CreatedAt:   rec.CreatedAt.Format(timeFormat),
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"records": out})
}

type recordResponse struct {
	ID          int64             `json:"id"`
	RowIndex    int               `json:"rowIndex"`
	SourceBatch string            `json:"sourceBatch"`
	CreatedAt   string            `json:"createdAt"`
	Fields      []ingestion.Field `json:"fields"`
}

const timeFormat = "2006-01-02T15:04:05Z07:00" // RFC3339, same as time.RFC3339 spelled out for clarity at the call site

// GetRecord returns one decrypted record, but ONLY if it belongs to the
// session's own KIT ID — the store query is scoped by KIT ID in the same
// SQL statement (see store.GetRecordForMember), and both "no such record"
// and "that record belongs to someone else" return the identical 404 here
// (invariant #5): the handler has no way to tell the two apart, by design.
func (s *Server) GetRecord(w http.ResponseWriter, r *http.Request) {
	kitID := kitIDFromContext(r.Context())

	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		badRequest(w, "id must be a number")
		return
	}

	ctx := r.Context()
	rec, err := s.Store.GetRecordForMember(ctx, kitID, id)
	if errors.Is(err, store.ErrNotFound) {
		notFound(w)
		return
	}
	if err != nil {
		serverError(w)
		return
	}

	plaintext, err := s.Crypto.Decrypt(ctx, rec.ContentEnc)
	if err != nil {
		serverError(w)
		return
	}
	fields, err := ingestion.DecodeRow(plaintext)
	if err != nil {
		serverError(w)
		return
	}

	// Every successful, ownership-checked view is logged — this is the
	// audit trail described in store.LogRecordAccess's doc comment.
	_ = s.Store.LogRecordAccess(ctx, kitID, rec.ID, clientIP(r))

	writeJSON(w, http.StatusOK, recordResponse{
		ID:          rec.ID,
		RowIndex:    rec.RowIndex,
		SourceBatch: rec.SourceBatch.String(),
		CreatedAt:   rec.CreatedAt.Format(timeFormat),
		Fields:      fields,
	})
}
