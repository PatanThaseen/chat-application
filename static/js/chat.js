document.addEventListener('DOMContentLoaded', function() {
    const messageContainer = document.getElementById('messageContainer');
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    const activeUsers = document.getElementById('activeUsers');
    const currentUsername = document.querySelector('.navbar-text').textContent.replace('Welcome, ', '').replace('!', '');

    let lastMessageTime = null;

    function createMessageElement(message) {
        const div = document.createElement('div');
        div.className = `message ${message.username === currentUsername ? 'own' : 'other'}`;
        div.innerHTML = `
            <div class="username">${message.username}</div>
            <div class="content">${escapeHtml(message.content)}</div>
            <div class="timestamp">${message.timestamp}</div>
        `;
        return div;
    }

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function updateActiveUsers(users) {
        activeUsers.innerHTML = users.map(user => `
            <li class="active-user">
                <i class="fa fa-circle"></i>${escapeHtml(user)}
            </li>
        `).join('');
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
        } catch (error) {
            console.error('Error fetching updates:', error);
        }
    }

    messageForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const message = messageInput.value.trim();
        if (!message) return;

        try {
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message }),
            });

            if (!response.ok) throw new Error('Network response was not ok');
            
            messageInput.value = '';
            await fetchUpdates();
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message. Please try again.');
        }
    });

    // Initial fetch and periodic updates
    fetchUpdates();
    setInterval(fetchUpdates, 30000); // Refresh every 30 seconds
});
