from flask import Flask, render_template, request, session, redirect, url_for, jsonify, flash
from datetime import datetime, timedelta
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
import os
import logging
from forms import RegistrationForm, LoginForm
from extensions import db
from models import User, Message

# Configure logging
logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "your-secret-key-here")

# Database configuration
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db.init_app(app)

# Login manager configuration
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(id):
    return User.query.get(int(id))

def cleanup_inactive_users():
    """Update last_seen time for inactive users"""
    cutoff_time = datetime.utcnow() - timedelta(minutes=5)
    User.query.filter(User.last_seen < cutoff_time).update({'last_seen': None})
    db.session.commit()

@app.route('/')
def index():
    if not current_user.is_authenticated:
        return redirect(url_for('login'))
    return redirect(url_for('chat'))

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))

    form = RegistrationForm()
    if form.validate_on_submit():
        user = User(username=form.username.data, email=form.email.data)
        user.set_password(form.password.data)
        db.session.add(user)
        db.session.commit()
        flash('Registration successful! Please login.', 'success')
        return redirect(url_for('login'))
    return render_template('register.html', form=form)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))

    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()
        if user and user.check_password(form.password.data):
            login_user(user)
            user.last_seen = datetime.utcnow()
            db.session.commit()
            return redirect(url_for('chat'))
        flash('Invalid email or password', 'error')
    return render_template('login.html', form=form)

@app.route('/logout')
@login_required
def logout():
    current_user.last_seen = None
    db.session.commit()
    logout_user()
    return redirect(url_for('login'))

@app.route('/chat')
@login_required
def chat():
    return render_template('chat.html', username=current_user.username)

@app.route('/api/messages', methods=['GET', 'POST'])
@login_required
def handle_messages():
    if request.method == 'POST':
        content = request.json.get('message', '').strip()
        if content:
            message = Message(content=content, user_id=current_user.id)
            db.session.add(message)
            current_user.last_seen = datetime.utcnow()
            db.session.commit()
            return jsonify({'status': 'success'})
        return jsonify({'error': 'Empty message'}), 400

    # Update user's last seen time
    current_user.last_seen = datetime.utcnow()
    db.session.commit()
    cleanup_inactive_users()

    # Get recent messages and active users
    messages = Message.query.order_by(Message.timestamp.desc()).limit(50).all()
    active_users = User.query.filter(
        User.last_seen.isnot(None)
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