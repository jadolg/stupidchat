package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"

	"github.com/gorilla/websocket"
)

// Config holds application configuration
type Config struct {
	UploadDir         string `json:"uploadDir"`
	MaxMessageHistory int    `json:"maxMessageHistory"`
	ServerAddress     string `json:"serverAddress"`
}

var (
	config = Config{
		UploadDir:         "./uploads",
		MaxMessageHistory: 10,
		ServerAddress:     ":8080",
	}
)

// Client represents a connected WebSocket client
type Client struct {
	conn     *websocket.Conn
	username string
}

// Message represents a chat message or event
type Message struct {
	Type     string   `json:"type"` // "message", "user_join", "user_leave", "file_upload"
	Username string   `json:"username"`
	Message  string   `json:"message"`
	Users    []string `json:"users"`              // List of connected users
	FileName string   `json:"fileName,omitempty"` // File name for file uploads
}

var (
	clients        = make(map[*Client]bool)
	mutex          sync.Mutex
	messageHistory []Message // Slice to store the latest messages
	upgrader       = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all connections (for development)
		},
	}
)

// init initializes the application
func init() {
	// Create the upload directory if it doesn't exist
	if err := os.MkdirAll(config.UploadDir, os.ModePerm); err != nil {
		log.Fatal("Failed to create upload directory:", err)
	}
}

// broadcast sends a message to all connected clients
func broadcast(message []byte) {
	mutex.Lock()
	defer mutex.Unlock()
	for client := range clients {
		if err := client.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			log.Println("Broadcast error:", err)
			client.conn.Close()
			delete(clients, client)
		}
	}
}

// broadcastUserList sends the updated user list to all clients
func broadcastUserList() {
	mutex.Lock()
	userList := make([]string, 0, len(clients))
	for client := range clients {
		userList = append(userList, client.username)
	}
	mutex.Unlock()

	message := Message{
		Type:  "user_list",
		Users: userList,
	}
	messageBytes, _ := json.Marshal(message)
	broadcast(messageBytes)
}

// handleWebSocket handles WebSocket connections
func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer conn.Close()

	// Read the username from the client
	_, usernameBytes, err := conn.ReadMessage()
	if err != nil {
		log.Println("Username read error:", err)
		return
	}
	username := string(usernameBytes)

	client := &Client{conn: conn, username: username}
	mutex.Lock()
	clients[client] = true
	mutex.Unlock()

	// Send the latest messages to the newly connected client
	sendMessageHistory(client)

	// Broadcast user join event
	broadcastUserJoin(username)

	// Send the updated user list to all clients
	broadcastUserList()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Println("Read error:", err)
			handleClientDisconnect(client, username)
			break
		}

		// Handle incoming message
		handleIncomingMessage(username, string(message))
	}
}

// sendMessageHistory sends the latest messages to a client
func sendMessageHistory(client *Client) {
	mutex.Lock()
	defer mutex.Unlock()
	historyMessage := Message{
		Type:    "message_history",
		Message: "Latest messages",
	}
	historyMessageBytes, _ := json.Marshal(historyMessage)
	if err := client.conn.WriteMessage(websocket.TextMessage, historyMessageBytes); err != nil {
		log.Println("Error sending message history:", err)
	}
	for _, msg := range messageHistory {
		msgBytes, _ := json.Marshal(msg)
		if err := client.conn.WriteMessage(websocket.TextMessage, msgBytes); err != nil {
			log.Println("Error sending message history:", err)
		}
	}
}

// broadcastUserJoin broadcasts a user join event
func broadcastUserJoin(username string) {
	joinMessage := Message{
		Type:     "user_join",
		Username: username,
	}
	joinMessageBytes, _ := json.Marshal(joinMessage)
	broadcast(joinMessageBytes)
}

// handleClientDisconnect handles client disconnection
func handleClientDisconnect(client *Client, username string) {
	mutex.Lock()
	delete(clients, client)
	mutex.Unlock()

	// Broadcast user leave event
	leaveMessage := Message{
		Type:     "user_leave",
		Username: username,
	}
	leaveMessageBytes, _ := json.Marshal(leaveMessage)
	broadcast(leaveMessageBytes)

	// Send the updated user list to all clients
	broadcastUserList()
}

// handleIncomingMessage processes incoming chat messages
func handleIncomingMessage(username, message string) {
	chatMessage := Message{
		Type:     "message",
		Username: username,
		Message:  message,
	}
	chatMessageBytes, _ := json.Marshal(chatMessage)

	// Add the message to the history
	mutex.Lock()
	messageHistory = append(messageHistory, chatMessage)
	if len(messageHistory) > config.MaxMessageHistory {
		messageHistory = messageHistory[1:] // Remove the oldest message
	}
	mutex.Unlock()

	// Broadcast the message
	broadcast(chatMessageBytes)
}

// handleFileUpload handles file uploads
func handleFileUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Invalid request method", http.StatusMethodNotAllowed)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Unable to read file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Save the file to the upload directory
	filePath := filepath.Join(config.UploadDir, header.Filename)
	outFile, err := os.Create(filePath)
	if err != nil {
		http.Error(w, "Unable to save file", http.StatusInternalServerError)
		return
	}
	defer outFile.Close()

	_, err = io.Copy(outFile, file)
	if err != nil {
		http.Error(w, "Unable to save file", http.StatusInternalServerError)
		return
	}

	// Broadcast the file upload event
	username := r.FormValue("username")
	uploadMessage := Message{
		Type:     "file_upload",
		Username: username,
		FileName: header.Filename,
	}
	uploadMessageBytes, _ := json.Marshal(uploadMessage)
	broadcast(uploadMessageBytes)

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("File uploaded successfully"))
}

// handleFileDownload handles file downloads securely
func handleFileDownload(w http.ResponseWriter, r *http.Request) {
	fileName := r.URL.Query().Get("file")
	if fileName == "" {
		http.Error(w, "File name is required", http.StatusBadRequest)
		return
	}

	// Construct the full file path
	filePath := filepath.Join(config.UploadDir, fileName)

	// Resolve the absolute path to prevent directory traversal
	absFilePath, err := filepath.Abs(filePath)
	if err != nil {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	// Ensure the resolved path is within the upload directory
	absUploadDir, err := filepath.Abs(config.UploadDir)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Check if the resolved file path is within the upload directory
	if !strings.HasPrefix(absFilePath, absUploadDir) {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	// Check if the file exists
	if _, err := os.Stat(absFilePath); os.IsNotExist(err) {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Serve the file securely
	http.ServeFile(w, r, absFilePath)
}

// handleUploadedFiles lists uploaded files
func handleUploadedFiles(w http.ResponseWriter, r *http.Request) {
	files, err := os.ReadDir(config.UploadDir)
	if err != nil {
		http.Error(w, "Unable to read upload directory", http.StatusInternalServerError)
		return
	}

	fileNames := make([]string, 0, len(files))
	for _, file := range files {
		if !file.IsDir() {
			fileNames = append(fileNames, file.Name())
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(fileNames)
}

func main() {
	// Set up HTTP routes
	fs := http.FileServer(http.Dir("static"))
	http.Handle("/", fs)
	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/upload", handleFileUpload)
	http.HandleFunc("/download", handleFileDownload)
	http.HandleFunc("/uploaded-files", handleUploadedFiles)

	// Start the server
	server := &http.Server{Addr: config.ServerAddress}
	go func() {
		fmt.Println("Server is running on http://localhost" + config.ServerAddress)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("Server error:", err)
		}
	}()

	// Graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("Shutting down server...")
	if err := server.Close(); err != nil {
		log.Fatal("Server shutdown error:", err)
	}
	log.Println("Server stopped")
}
