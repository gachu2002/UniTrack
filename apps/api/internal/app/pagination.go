package app

import (
	"errors"
	"net/url"
	"strconv"
	"strings"
)

type paginationParams struct {
	Page   int
	Limit  int
	Offset int
}

type paginatedResponse[T any] struct {
	Items []T   `json:"items"`
	Page  int   `json:"page"`
	Limit int   `json:"limit"`
	Total int64 `json:"total"`
}

func parsePaginationParams(values url.Values, fallbackLimit int, maxLimit int) (paginationParams, error) {
	limit, err := parseListLimit(values.Get("limit"), fallbackLimit, maxLimit)
	if err != nil {
		return paginationParams{}, err
	}

	page := 1
	if rawPage := strings.TrimSpace(values.Get("page")); rawPage != "" {
		parsedPage, err := strconv.Atoi(rawPage)
		if err != nil || parsedPage <= 0 {
			return paginationParams{}, errors.New("invalid page")
		}
		page = parsedPage
	}
	if page-1 > int(^uint(0)>>1)/limit {
		return paginationParams{}, errors.New("invalid page")
	}

	return paginationParams{Page: page, Limit: limit, Offset: (page - 1) * limit}, nil
}

func wantsPaginatedResponse(values url.Values) bool {
	return values.Has("page") || values.Has("limit")
}
