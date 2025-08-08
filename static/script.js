let justLoaded = false;

window.onload = function () {
    document.getElementById("message-input").focus();
    requestNotificationPermission();
    justLoaded = true;
    fetchUploadedFiles(); // Fetch and display uploaded files on page load
    setTimeout(() => {
        justLoaded = false;
    }, 1500);
};

// Add offline/online event handlers
window.addEventListener('online', () => showSystemMessage('You are back online'));
window.addEventListener('offline', () => showSystemMessage('You are now offline'));

// Function to show system messages in the chat box
function showSystemMessage(message) {
    const chatBox = document.getElementById("chat-box");
    chatBox.insertAdjacentHTML("beforeend", `<div class="chat-message system"><div class="message-content">${message}</div></div>`);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Function to fetch and display uploaded files
function fetchUploadedFiles() {
    fetch("/uploaded-files")
        .then(response => response.json())
        .then(files => {
            const fileList = document.getElementById("uploaded-files");
            fileList.innerHTML = ""; // Clear the existing list
            files.forEach(file => {
                fileList.insertAdjacentHTML("beforeend", `<li><a href="/download?file=${file}" download="${file}">${file}</a></li>`);
            });
        })
        .catch(error => {
            console.error("Error fetching uploaded files:", error);
        });
}

// Function to request notification permission
function requestNotificationPermission() {
    if (Notification.permission !== "granted") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                console.log("Notification permission granted.");
            }
        });
    }
}

// Function to show a notification
function showNotification(title, body) {
    if (Notification.permission === "granted") {
        new Notification(title, {body});
    }
}

// Function to generate a random username
function generateUsername() {
    const adjectives = ["admiring", "awesome", "blissful", "brave", "charming", "clever", "dazzling", "determined", "eager", "festive", "focused", "friendly", "gallant", "happy", "jolly", "kind", "lucid", "mystifying", "modest", "optimistic", "peaceful", "practical", "quirky", "quizzical", "relaxed", "serene", "silly", "stoic", "trusting", "upbeat", "vibrant", "wonderful"];
    const nouns = ["albattani", "allen", "almeida", "agnesi", "archimedes", "ardinghelli", "aryabhata", "austin", "babbage", "banach", "bardeen", "bartik", "bassi", "beaver", "bell", "benz", "bhabha", "bhaskara", "blackwell", "bohr", "booth", "borg", "bose", "boyd", "brahmagupta", "brattain", "brown", "carson", "chandrasekhar", "shannon", "clarke", "colden", "cori", "cray", "curie", "darwin", "davinci", "dijkstra", "dubinsky", "easley", "edison", "einstein", "elion", "engelbart", "euclid", "euler", "fermat", "fermi", "feynman", "franklin", "galileo", "gates", "goldberg", "goldstine", "goldwasser", "golick", "goodall", "haibt", "hamilton", "hawking", "heisenberg", "hermann", "heyrovsky", "hodgkin", "hoover", "hopper", "hugle", "hypatia", "jang", "jennings", "jepsen", "joliot", "jones", "kalam", "kare", "keller", "kepler", "khayyam", "khorana", "kilby", "kirch", "knuth", "kowalevski", "lalande", "lamarr", "lamport", "leakey", "leavitt", "lewin", "lichterman", "liskov", "lovelace", "lumiere", "mahavira", "mayer", "mccarthy", "mcclintock", "mclean", "mcnulty", "meitner", "mendel", "mendeleev", "meninsky", "merkle", "mestorf", "minsky", "mirzakhani", "morse", "murdock", "neumann", "newton", "nightingale", "nobel", "noether", "northcutt", "noyce", "panini", "pare", "pasteur", "payne", "perlman", "pike", "poincare", "poitras", "ptolemy", "raman", "ramanujan", "ride", "ritchie", "roentgen", "rosalind", "saha", "sammet", "shaw", "shirley", "shockley", "sinoussi", "snyder", "spence", "stallman", "stonebraker", "swanson", "swartz", "swirles", "tesla", "thompson", "torvalds", "turing", "varahamihira", "visvesvaraya", "volhard", "wescoff", "wiles", "williams", "wilson", "wing", "wozniak", "wright", "yalow", "yonath"];

    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${capitalize(randomAdjective)} ${capitalize(randomNoun)}`;
}

// Helper function to capitalize the first letter of a string
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Function to generate a color from a string (username)
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = `hsl(${hash % 360}, 70%, 50%)`; // Use HSL for vibrant colors
    return color;
}

// Function to get or generate a username
function getOrGenerateUsername() {
    // Try to get the username from localStorage
    const savedUsername = localStorage.getItem('chatUsername');
    if (savedUsername) {
        return savedUsername;
    }

    // Generate a new username if none exists
    const newUsername = generateUsername();
    // Save it to localStorage
    localStorage.setItem('chatUsername', newUsername);
    return newUsername;
}

// Replace the username generation line with
const username = getOrGenerateUsername();
console.log("Your username is:", username);

// Display the username with its color
const usernameDisplay = document.getElementById("username-display");
usernameDisplay.textContent = username;
usernameDisplay.style.color = stringToColor(username);

// WebSocket connection
let ws;
let reconnectInterval = 5000; // Reconnect every 5 seconds

function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log("Connected to WebSocket server");
        if (!justLoaded) {
            showSystemMessage('You are back online');
        }
        ws.send(username); // Send the username to the server

        // Send a ping to the server every 30 seconds
        setInterval(() => {
            ws.send(JSON.stringify({ type: 'ping' }));
        }, 30000);
    };

    ws.onclose = () => {
        console.log("Disconnected from WebSocket server. Attempting to reconnect...");
        showSystemMessage('You are now offline');
        fetchUploadedFiles()
        setTimeout(connectWebSocket, reconnectInterval);
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data); // Parse the message as JSON

        switch (data.type) {
            case "message":
                // Check if the message is from the current user
                const isCurrentUser = data.username === username;

                // Check if the message is from the same user as the last message
                const isSameUser = data.username === lastMessageUser;

                // Format and display the chat message
                const formattedMessage = formatMessage(data.username, data.message, isCurrentUser, isSameUser);
                const chatBox = document.getElementById("chat-box");
                chatBox.insertAdjacentHTML("beforeend", formattedMessage); // Safely append HTML

                // Auto-scroll to the bottom of the chat box
                chatBox.scrollTop = chatBox.scrollHeight;

                // Update the last message user
                lastMessageUser = data.username;

                // Apply syntax highlighting to new code blocks
                applySyntaxHighlighting();

                // Show a notification if the message is not from the current user
                if (!isCurrentUser && !justLoaded) {
                    showNotification(data.username, data.message);
                }

                break;

            case "user_list":
                // Update the connected users list
                updateUserList(data.users);
                break;

            case "user_join":
                // Notify when a user joins
                const joinMessage = `${data.username} joined the chat.`;
                const chatBoxJoin = document.getElementById("chat-box");
                chatBoxJoin.insertAdjacentHTML("beforeend", `<div class="chat-message system"><div class="message-content">${joinMessage}</div></div>`);
                chatBoxJoin.scrollTop = chatBoxJoin.scrollHeight; // Auto-scroll to the bottom
                break;

            case "user_leave":
                // Notify when a user leaves
                const leaveMessage = `${data.username} left the chat.`;
                const chatBoxLeave = document.getElementById("chat-box");
                chatBoxLeave.insertAdjacentHTML("beforeend", `<div class="chat-message system"><div class="message-content">${leaveMessage}</div></div>`);
                chatBoxLeave.scrollTop = chatBoxLeave.scrollHeight; // Auto-scroll to the bottom
                break;
            case "file_upload":
                // Display the file upload event
                const fileMessage = `${data.username} uploaded a file: <a href="/download?file=${data.fileName}" download="${data.fileName}">${data.fileName}</a>`;
                const chatBoxFile = document.getElementById("chat-box");
                chatBoxFile.insertAdjacentHTML("beforeend", `<div class="chat-message system"><div class="message-content">${fileMessage}</div></div>`);
                chatBoxFile.scrollTop = chatBoxFile.scrollHeight; // Auto-scroll to the bottom

                // Add the file to the uploaded files list
                const fileList = document.getElementById("uploaded-files");
                fileList.insertAdjacentHTML("beforeend", `<li><a href="/download?file=${data.fileName}" download="${data.fileName}">${data.fileName}</a></li>`);
                break;
            case "pong":
                // Server acknowledged the ping
                break;
        }
    };
}

// Initial WebSocket connection
connectWebSocket();

// Function to format a message with a chat bubble
function formatMessage(username, message, isCurrentUser, isSameUser = false) {
    const color = stringToColor(username);

    // Parse Markdown and sanitize the output
    const sanitizedMessage = DOMPurify.sanitize(marked.parse(message));

    // Determine the chat bubble class based on the sender
    const messageClass = isCurrentUser ? "sent" : "received";

    // Hide the username if it's a consecutive message from the same user
    const usernameElement = isSameUser ? "" : `<div class="username" style="color: ${color};">${username}</div>`;

    return `
        <div class="chat-message ${messageClass} ${isSameUser ? "same-user" : ""}">
            ${usernameElement}
            <div class="message-content">${sanitizedMessage}</div>
        </div>
    `;
}

// Apply syntax highlighting to all code blocks in the chat box
function applySyntaxHighlighting() {
    document.querySelectorAll("pre code").forEach((block) => {
        hljs.highlightBlock(block);
    });
}

// Track the last user who sent a message
let lastMessageUser = null;

// Function to update the connected users list
function updateUserList(users) {
    const userList = document.getElementById("user-list");
    userList.innerHTML = "<strong>Connected Users:</strong><br>";

    users.forEach((user) => {
        const color = stringToColor(user);
        userList.innerHTML += `<span style="color: ${color};">${user}</span><br>`;
    });
}

// Handle keydown events for the textarea
const input = document.getElementById("message-input");
input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        // Send the message if Enter is pressed without Shift
        event.preventDefault(); // Prevent default behavior (e.g., newline in textarea)
        sendMessage();
    }
    // Shift + Enter will naturally add a newline in a textarea
});

// Automatically adjust textarea height based on content
input.addEventListener("input", () => {
    input.style.height = "auto"; // Reset height
    input.style.height = `${input.scrollHeight}px`; // Set height to fit content
});

function sendMessage() {
    const message = input.value.trim();
    if (message !== "") {
        // Send the message to the server
        ws.send(message);
        input.value = ""; // Clear the textarea
        input.style.height = "auto"; // Reset height after sending
    }
}


// Set the username for the file upload form
document.getElementById("upload-username").value = username;

// Handle file upload form submission
document.getElementById("file-upload-form").addEventListener("submit", function (event) {
    event.preventDefault();

    const formData = new FormData();
    formData.append("file", document.getElementById("file-input").files[0]);
    formData.append("username", username);

    fetch("/upload", {
        method: "POST",
        body: formData,
    })
        .then((response) => response.text())
        .then((data) => {
            console.log(data);
            document.getElementById("file-input").value = ""; // Clear the file input
        })
        .catch((error) => {
            console.error("Error uploading file:", error);
        });
});