package main

import "testing"

func TestIsLocalDatabaseURL(t *testing.T) {
	cases := []struct {
		name        string
		databaseURL string
		want        bool
	}{
		{name: "localhost", databaseURL: "postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable", want: true},
		{name: "ipv4 loopback", databaseURL: "postgres://postgres:postgres@127.0.0.1:55432/unitrack?sslmode=disable", want: true},
		{name: "ipv6 loopback", databaseURL: "postgres://postgres:postgres@[::1]:55432/unitrack?sslmode=disable", want: true},
		{name: "remote host", databaseURL: "postgres://postgres:postgres@db.example.test:5432/unitrack", want: false},
		{name: "malformed", databaseURL: "://not-a-url", want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isLocalDatabaseURL(tc.databaseURL); got != tc.want {
				t.Fatalf("isLocalDatabaseURL() = %v, want %v", got, tc.want)
			}
		})
	}
}
