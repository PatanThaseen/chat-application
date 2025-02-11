document.addEventListener('DOMContentLoaded', function() {
    const messageContainer = document.getElementById('messageContainer');
    const messageForm = document.getElementById('messageForm');
    const messageEditor = document.getElementById('messageEditor');
    const activeUsers = document.getElementById('activeUsers');
    const typingIndicator = document.getElementById('typingIndicator');
    const emojiButton = document.getElementById('emojiButton');
    const currentUsername = document.querySelector('.navbar-text').textContent.trim();

    let lastTypingSignal = 0;

    // Initialize emoji picker
    const picker = new EmojiButton({
        position: 'top-start',
        theme: 'light',
        autoHide: false,
        emojisPerRow: 8,
        rows: 8,
        showPreview: true,
        showSearch: true,
        showRecents: true,
        styleProperties: {
            '--emoji-size': '1.5rem',
            '--emoji-padding': '0.5rem',
            '--category-button-size': '2rem'
        }
    });

    picker.on('emoji', emoji => {
        insertTextAtCursor(emoji);
    });

    emojiButton.addEventListener('click', () => {
        picker.togglePicker(emojiButton);
    });

    function insertTextAtCursor(text) {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.collapse(false);
        messageEditor.focus();
    }

    function formatText(command) {
        document.execCommand(command, false, null);
        messageEditor.focus();
    }

    window.formatText = formatText; // Make it globally available

    function createMessageElement(message) {
        const div = document.createElement('div');
        div.className = `message ${message.username === currentUsername ? 'own' : 'other'}`;

        const actions = message.username === currentUsername ? `
            <div class="actions">
                <button onclick="editMessage(${message.id})" title="Edit">
                    <i class="fa fa-edit"></i>
                </button>
                <button onclick="deleteMessage(${message.id})" title="Delete">
                    <i class="fa fa-trash"></i>
                </button>
            </div>
        ` : '';

        const editedBadge = message.edited ? '<span class="edited-badge">(edited)</span>' : '';

        div.innerHTML = `
            <div class="username">${message.username}</div>
            <div class="content">${message.content}</div>
            <div class="timestamp">
                ${message.timestamp} ${editedBadge}
            </div>
            ${actions}
        `;
        return div;
    }

    function signalTyping() {
        const now = Date.now();
        if (now - lastTypingSignal > 3000) {
            fetch('/api/typing', { method: 'POST' })
                .catch(error => console.error('Error signaling typing:', error));
            lastTypingSignal = now;
        }
    }

    messageEditor.addEventListener('input', signalTyping);

    function updateActiveUsers(users) {
        activeUsers.innerHTML = users.map(user => `
            <li class="active-user">
                <i class="fa fa-circle"></i>
                ${escapeHtml(user)}
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
                    const text = typingUsers.length === 1 
                        ? `${typingUsers[0]} is typing...`
                        : `${typingUsers.join(', ')} are typing...`;
                    typingIndicator.querySelector('.typing-text').textContent = text;
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
                body: JSON.stringify({ 
                    message: content,
                    formatted: true
                }),
            });

            if (!response.ok) throw new Error('Failed to send message');

            messageEditor.innerHTML = '';
            await fetchUpdates();
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message. Please try again.');
        }
    });

    window.editMessage = async function(messageId) {
        const messageElement = document.querySelector(`.message[data-id="${messageId}"]`);
        const content = messageElement.querySelector('.content').innerHTML;

        const newContent = prompt('Edit message:', content);
        if (newContent && newContent !== content) {
            try {
                const response = await fetch(`/api/messages/${messageId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ content: newContent }),
                });

                if (!response.ok) throw new Error('Failed to edit message');
                await fetchUpdates();
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
                await fetchUpdates();
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

    // Initial fetch and periodic updates
    fetchUpdates();
    setInterval(fetchUpdates, 3000);
    setInterval(checkTypingStatus, 2000);
});