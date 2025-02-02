package main

import (
	"encoding/json"
	"fmt"
	"github.com/gorilla/websocket"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all connections (for development)
	},
}

type Client struct {
	conn     *websocket.Conn
	username string
}

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
)

const maxMessageHistory = 10  // Number of latest messages to store
const uploadDir = "./uploads" // Directory to store uploaded files

func init() {
	// Create the upload directory if it doesn't exist
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		log.Fatal("Failed to create upload directory:", err)
	}
}

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

	// Send the latest 10 messages to the newly connected client
	mutex.Lock()
	historyMessage := Message{
		Type:    "message_history",
		Message: "Latest messages",
		Users:   nil,
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
	mutex.Unlock()

	// Broadcast user join event
	joinMessage := Message{
		Type:     "user_join",
		Username: username,
	}
	joinMessageBytes, _ := json.Marshal(joinMessage)
	broadcast(joinMessageBytes)

	// Send the updated user list to all clients
	broadcastUserList()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Println("Read error:", err)
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
			break
		}

		// Create a new message
		chatMessage := Message{
			Type:     "message",
			Username: username,
			Message:  string(message),
		}
		chatMessageBytes, _ := json.Marshal(chatMessage)

		// Add the message to the history
		mutex.Lock()
		messageHistory = append(messageHistory, chatMessage)
		if len(messageHistory) > maxMessageHistory {
			messageHistory = messageHistory[1:] // Remove the oldest message
		}
		mutex.Unlock()

		// Broadcast the message
		broadcast(chatMessageBytes)
	}
}

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
	filePath := filepath.Join(uploadDir, header.Filename)
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

func handleFileDownload(w http.ResponseWriter, r *http.Request) {
	fileName := r.URL.Query().Get("file")
	if fileName == "" {
		http.Error(w, "File name is required", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(uploadDir, fileName)
	http.ServeFile(w, r, filePath)
}

func handleUploadedFiles(w http.ResponseWriter, r *http.Request) {
	files, err := os.ReadDir(uploadDir)
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
	fs := http.FileServer(http.Dir("static"))
	http.Handle("/", fs)

	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/upload", handleFileUpload)
	http.HandleFunc("/download", handleFileDownload)
	http.HandleFunc("/uploaded-files", handleUploadedFiles)

	fmt.Println("Server is running on http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}
