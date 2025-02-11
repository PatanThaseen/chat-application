from flask import Flask, render_template, request, session, redirect, url_for, jsonify
from datetime import datetime, timedelta
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
app.secret_key = "your-secret-key-here"  # In production, use environment variable

# In-memory storage
messages = []
active_users = {}

def cleanup_inactive_users():
    """Remove users who haven't been active in the last 5 minutes"""
    current_time = datetime.now()
    inactive = [user for user, last_seen in active_users.items() 
               if (current_time - last_seen) > timedelta(minutes=5)]
    for user in inactive:
        del active_users[user]

@app.route('/')
def index():
    if 'username' not in session:
        return redirect(url_for('login'))
    return redirect(url_for('chat'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        if username:
            session['username'] = username
            active_users[username] = datetime.now()
            return redirect(url_for('chat'))
        return render_template('login.html', error="Username is required")
    return render_template('login.html')

@app.route('/logout')
def logout():
    if 'username' in session:
        username = session['username']
        if username in active_users:
            del active_users[username]
        session.pop('username', None)
    return redirect(url_for('login'))

@app.route('/chat')
def chat():
    if 'username' not in session:
        return redirect(url_for('login'))
    return render_template('chat.html', username=session['username'])

@app.route('/api/messages', methods=['GET', 'POST'])
def handle_messages():
    if 'username' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    if request.method == 'POST':
        content = request.json.get('message', '').strip()
        if content:
            messages.append({
                'username': session['username'],
                'content': content,
                'timestamp': datetime.now().strftime('%H:%M:%S')
            })
            return jsonify({'status': 'success'})
        return jsonify({'error': 'Empty message'}), 400

    # Update user's last seen time
    active_users[session['username']] = datetime.now()
    cleanup_inactive_users()
    
    return jsonify({
        'messages': messages[-50:],  # Return last 50 messages
        'active_users': list(active_users.keys())
    })
