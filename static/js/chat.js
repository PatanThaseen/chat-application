document.addEventListener('DOMContentLoaded', function() {
    const messageContainer = document.getElementById('messageContainer');
    const messageForm = document.getElementById('messageForm');
    const messageEditor = document.getElementById('messageEditor');
    const activeUsers = document.getElementById('activeUsers');
    const typingIndicator = document.getElementById('typingIndicator');
    const emojiButton = document.getElementById('emojiButton');
    const emojiModal = new bootstrap.Modal(document.getElementById('emojiModal'));
    const currentUsername = document.querySelector('.navbar-text').textContent.replace('Welcome, ', '').replace('!', '');

    let lastMessageTime = null;
    let typingTimeout = null;
    let lastTypingSignal = 0;

    // Initialize emoji picker
    new EmojiMart.Picker({
        data: async () => {
            const response = await fetch('https://cdn.jsdelivr.net/npm/@emoji-mart/data');
            return response.json();
        },
        onEmojiSelect: (emoji) => {
            insertEmoji(emoji.native);
            emojiModal.hide();
        }
    });

    function insertEmoji(emoji) {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const textNode = document.createTextNode(emoji);
        range.insertNode(textNode);
        range.collapse(false);
    }

    emojiButton.addEventListener('click', () => {
        emojiModal.show();
    });

    function formatText(command) {
        document.execCommand(command, false, null);
        messageEditor.focus();
    }

    function createMessageElement(message) {
        const div = document.createElement('div');
        div.className = `message ${message.username === currentUsername ? 'own' : 'other'}`;

        const actions = message.username === currentUsername ? `
            <div class="actions">
                <button onclick="editMessage(${message.id})"><i class="fa fa-edit"></i></button>
                <button onclick="deleteMessage(${message.id})"><i class="fa fa-trash"></i></button>
            </div>
        ` : '';

        div.innerHTML = `
            <div class="username">${message.username}</div>
            <div class="content">${message.content}</div>
            <div class="timestamp">${message.timestamp}</div>
            ${actions}
        `;
        return div;
    }

    function signalTyping() {
        const now = Date.now();
        if (now - lastTypingSignal > 3000) {
            fetch('/api/typing', { method: 'POST' });
            lastTypingSignal = now;
        }
    }

    messageEditor.addEventListener('input', () => {
        signalTyping();
    });

    function updateActiveUsers(users) {
        activeUsers.innerHTML = users.map(user => `
            <li class="active-user">
                <i class="fa fa-circle"></i>${escapeHtml(user)}
            </li>
        `).join('');
    }

    async function checkTypingStatus() {
        try {
            const response = await fetch('/api/typing');
            const data = await response.json();
            if (data.typing && data.typing.length > 0) {
                const typingUsers = data.typing.filter(user => user !== currentUsername);
                if (typingUsers.length > 0) {
                    typingIndicator.textContent = `${typingUsers.join(', ')} ${typingUsers.length > 1 ? 'are' : 'is'} typing...`;
                    typingIndicator.style.display = 'block';
                } else {
                    typingIndicator.style.display = 'none';
                }
            } else {
                typingIndicator.style.display = 'none';
            }
        } catch (error) {
            console.error('Error checking typing status:', error);
        }
    }

    async function fetchUpdates() {
        try {
            const response = await fetch('/api/messages');
            if (!response.ok) throw new Error('Network response was not ok');

            const data = await response.json();

            // Update messages
            messageContainer.innerHTML = '';
            data.messages.forEach(message => {
                messageContainer.appendChild(createMessageElement(message));
            });
            messageContainer.scrollTop = messageContainer.scrollHeight;

            // Update active users
            updateActiveUsers(data.active_users);

            // Check typing status
            await checkTypingStatus();
        } catch (error) {
            console.error('Error fetching updates:', error);
        }
    }

    messageForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const content = messageEditor.innerHTML.trim();
        if (!content) return;

        try {
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: content, formatted: true }),
            });

            if (!response.ok) throw new Error('Network response was not ok');

            messageEditor.innerHTML = '';
            await fetchUpdates();
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message. Please try again.');
        }
    });

    // Initial fetch and periodic updates
    fetchUpdates();
    setInterval(fetchUpdates, 3000); // More frequent updates
    setInterval(checkTypingStatus, 2000); // Check typing status
});

// Global functions for message actions
window.editMessage = async function(messageId) {
    // Implementation for editing messages
    const newContent = prompt('Edit message:');
    if (newContent) {
        try {
            const response = await fetch(`/api/messages/${messageId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: newContent }),
            });
            if (!response.ok) throw new Error('Failed to edit message');
            fetchUpdates();
        } catch (error) {
            console.error('Error editing message:', error);
            alert('Failed to edit message. Please try again.');
        }
    }
};

window.deleteMessage = async function(messageId) {
    if (confirm('Are you sure you want to delete this message?')) {
        try {
            const response = await fetch(`/api/messages/${messageId}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to delete message');
            fetchUpdates();
        } catch (error) {
            console.error('Error deleting message:', error);
            alert('Failed to delete message. Please try again.');
        }
    }
};

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}