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
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "your-secret-key-here")

# Database configuration
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_pre_ping": True,
    "pool_recycle": 300,
}

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
        try:
            user = User(username=form.username.data, email=form.email.data)
            user.set_password(form.password.data)
            db.session.add(user)
            db.session.commit()
            logger.info(f"Successfully registered user: {user.username}")
            flash('Registration successful! Please login.', 'success')
            return redirect(url_for('login'))
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error during registration: {str(e)}")
            flash('An error occurred during registration. Please try again.', 'error')
    return render_template('register.html', form=form)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))

    form = LoginForm()
    if form.validate_on_submit():
        try:
            user = User.query.filter_by(email=form.email.data).first()
            if user and user.check_password(form.password.data):
                login_user(user)
                user.last_seen = datetime.utcnow()
                db.session.commit()
                logger.info(f"User logged in: {user.username}")
                return redirect(url_for('chat'))
            flash('Invalid email or password', 'error')
        except Exception as e:
            logger.error(f"Error during login: {str(e)}")
            flash('An error occurred during login. Please try again.', 'error')
    return render_template('login.html', form=form)

@app.route('/logout')
@login_required
def logout():
    username = current_user.username
    current_user.last_seen = None
    db.session.commit()
    logout_user()
    logger.info(f"User logged out: {username}")
    return redirect(url_for('login'))

@app.route('/chat')
@login_required
def chat():
    return render_template('chat.html', username=current_user.username)

@app.route('/api/typing', methods=['GET', 'POST'])
@login_required
def handle_typing():
    if request.method == 'POST':
        current_user.is_typing = datetime.utcnow()
        db.session.commit()
        return jsonify({'status': 'success'})

    # Get users who were typing in the last 5 seconds
    typing_threshold = datetime.utcnow() - timedelta(seconds=5)
    typing_users = User.query.filter(
        User.is_typing > typing_threshold,
        User.id != current_user.id
    ).all()

    return jsonify({
        'typing': [user.username for user in typing_users]
    })

@app.route('/api/messages/<int:message_id>', methods=['PUT', 'DELETE'])
@login_required
def handle_message(message_id):
    message = Message.query.get_or_404(message_id)

    # Ensure user owns the message
    if message.user_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403

    if request.method == 'DELETE':
        db.session.delete(message)
        db.session.commit()
        return jsonify({'status': 'success'})

    # Handle PUT (edit)
    content = request.json.get('content', '').strip()
    if not content:
        return jsonify({'error': 'Empty message'}), 400

    message.content = content
    message.edited_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/messages', methods=['GET', 'POST'])
@login_required
def handle_messages():
    if request.method == 'POST':
        content = request.json.get('message', '').strip()
        is_formatted = request.json.get('formatted', False)

        if content:
            try:
                message = Message(
                    content=content,
                    user_id=current_user.id,
                    is_formatted=is_formatted
                )
                db.session.add(message)
                current_user.last_seen = datetime.utcnow()
                db.session.commit()
                return jsonify({'status': 'success'})
            except Exception as e:
                db.session.rollback()
                logger.error(f"Error saving message: {str(e)}")
                return jsonify({'error': 'Failed to save message'}), 500
        return jsonify({'error': 'Empty message'}), 400

    try:
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
                'id': msg.id,
                'username': msg.author.username,
                'content': msg.content,
                'timestamp': msg.timestamp.strftime('%H:%M:%S'),
                'edited': msg.edited_at is not None,
                'formatted': msg.is_formatted
            } for msg in reversed(messages)],
            'active_users': [user.username for user in active_users]
        })
    except Exception as e:
        logger.error(f"Error fetching messages: {str(e)}")
        return jsonify({'error': 'Failed to fetch messages'}), 500

# Create tables
with app.app_context():
    db.create_all()