package main

import (
	"fmt"
	"log"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// TODO: initialize router, db, redis, reader client
	// TODO: register routes
	// TODO: start server

	fmt.Printf("narratorlog API starting on :%s\n", port)
	log.Fatal(fmt.Errorf("server not yet implemented"))
}
