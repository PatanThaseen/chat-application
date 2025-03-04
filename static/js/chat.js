document.addEventListener('DOMContentLoaded', function() {
    const messageContainer = document.getElementById('messageContainer');
    const messageForm = document.getElementById('messageForm');
    const messageEditor = document.getElementById('messageEditor');
    const activeUsers = document.getElementById('activeUsers');
    const typingIndicator = document.getElementById('typingIndicator');
    const currentUsername = document.querySelector('.navbar-text').textContent.trim();

    let lastTypingSignal = 0;

    // Initialize emoji picker with customized styles
    const picker = document.createElement('emoji-picker');
    picker.style.display = 'none';
    picker.style.position = 'fixed';
    picker.style.zIndex = '1000';
    picker.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
    picker.style.border = 'none';
    picker.style.borderRadius = '12px';
    document.body.appendChild(picker);

    document.querySelector('.emoji-button').addEventListener('click', (e) => {
        e.preventDefault(); // Prevent form submission
        const buttonRect = e.target.closest('.emoji-button').getBoundingClientRect();
        picker.style.display = picker.style.display === 'none' ? 'block' : 'none';

        // Position the picker relative to the viewport
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - buttonRect.bottom;

        if (spaceBelow < 400) { // If not enough space below
            picker.style.bottom = '10px';
            picker.style.top = 'auto';
        } else {
            picker.style.top = `${buttonRect.bottom + 5}px`;
            picker.style.bottom = 'auto';
        }

        picker.style.left = `${Math.min(buttonRect.left, window.innerWidth - 320)}px`; // 320px is approximate picker width
    });

    // Hide picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('emoji-picker') && !e.target.closest('.emoji-button')) {
            picker.style.display = 'none';
        }
    });

    picker.addEventListener('emoji-click', event => {
        const emoji = event.detail.unicode;
        insertAtCursor(emoji);
        picker.style.display = 'none';
    });

    function insertAtCursor(text) {
        if (!messageEditor) return;

        const selection = window.getSelection();
        const range = selection.getRangeAt(0);

        // Create a text node with the emoji
        const emojiNode = document.createTextNode(text);

        // Insert the emoji and move cursor after it
        range.insertNode(emojiNode);
        range.setStartAfter(emojiNode);
        range.setEndAfter(emojiNode);
        selection.removeAllRanges();
        selection.addRange(range);

        // Trigger input event to activate typing indicator
        messageEditor.dispatchEvent(new Event('input'));
        messageEditor.focus();
    }

    function formatText(command) {
        document.execCommand(command, false, null);
        messageEditor.focus();
    }

    window.formatText = formatText;

    function createMessageElement(message) {
        const div = document.createElement('div');
        div.className = `message ${message.username === currentUsername ? 'own' : 'other'}`;
        div.dataset.id = message.id;

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
            if (!data.messages) throw new Error('Invalid response format');

            // Update messages
            messageContainer.innerHTML = '';
            data.messages.forEach(message => {
                messageContainer.appendChild(createMessageElement(message));
            });
            messageContainer.scrollTop = messageContainer.scrollHeight;

            // Update active users
            if (data.active_users) {
                updateActiveUsers(data.active_users);
            }

            // Check typing status
            await checkTypingStatus();
        } catch (error) {
            console.error('Error fetching updates:', error);
            messageContainer.innerHTML = `
                <div class="text-center text-danger py-4">
                    <i class="fa fa-exclamation-circle"></i> Failed to load messages. Please refresh the page.
                </div>
            `;
        }
    }

    messageForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const content = messageEditor.innerHTML;
        if (!content || content === '<br>') return;  // Allow content with just emojis

        const submitButton = messageForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;

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

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to send message');
            }

            messageEditor.innerHTML = '';
            await fetchUpdates();
        } catch (error) {
            console.error('Error sending message:', error);
            alert(error.message || 'Failed to send message. Please try again.');
        } finally {
            submitButton.disabled = false;
        }
    });

    window.editMessage = async function(messageId) {
        const messageElement = document.querySelector(`.message[data-id="${messageId}"]`);
        if (!messageElement) return;

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