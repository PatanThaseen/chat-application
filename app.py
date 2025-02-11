from flask import Flask, render_template, request, session, redirect, url_for, jsonify
from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy
import os
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "your-secret-key-here")

# Database configuration
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

# Import models after db initialization to avoid circular imports
from models import User, Message

def cleanup_inactive_users():
    """Remove users who haven't been active in the last 5 minutes"""
    cutoff_time = datetime.utcnow() - timedelta(minutes=5)
    User.query.filter(User.last_seen < cutoff_time).delete()
    db.session.commit()

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
            user = User.query.filter_by(username=username).first()
            if not user:
                user = User(username=username)
                db.session.add(user)
            user.last_seen = datetime.utcnow()
            db.session.commit()
            session['username'] = username
            return redirect(url_for('chat'))
        return render_template('login.html', error="Username is required")
    return render_template('login.html')

@app.route('/logout')
def logout():
    if 'username' in session:
        username = session['username']
        user = User.query.filter_by(username=username).first()
        if user:
            db.session.delete(user)
            db.session.commit()
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

    user = User.query.filter_by(username=session['username']).first()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if request.method == 'POST':
        content = request.json.get('message', '').strip()
        if content:
            message = Message(content=content, user_id=user.id)
            db.session.add(message)
            user.last_seen = datetime.utcnow()
            db.session.commit()
            return jsonify({'status': 'success'})
        return jsonify({'error': 'Empty message'}), 400

    # Update user's last seen time
    user.last_seen = datetime.utcnow()
    db.session.commit()
    cleanup_inactive_users()

    # Get recent messages and active users
    messages = Message.query.order_by(Message.timestamp.desc()).limit(50).all()
    active_users = User.query.filter(
        User.last_seen >= datetime.utcnow() - timedelta(minutes=5)
    ).all()

    return jsonify({
        'messages': [{
            'username': msg.author.username,
            'content': msg.content,
            'timestamp': msg.timestamp.strftime('%H:%M:%S')
        } for msg in reversed(messages)],
        'active_users': [user.username for user in active_users]
    })

# Create tables
with app.app_context():
    db.create_all()