window.onload = function() {
    document.getElementById("message-input").focus();
    requestNotificationPermission();
};

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
        new Notification(title, { body });
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

// Generate a username for the current user
const username = generateUsername();
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
        ws.send(username); // Send the username to the server
    };

    ws.onclose = () => {
        console.log("Disconnected from WebSocket server. Attempting to reconnect...");
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
                if (!isCurrentUser) {
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