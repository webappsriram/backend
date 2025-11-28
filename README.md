# Backend API - Authentication System

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=5000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=invo_db

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=24h

# Admin User (optional - for create-admin script)
ADMIN_NAME=Admin User
ADMIN_EMAIL=admin@invo.com
ADMIN_PASSWORD=admin123
ADMIN_ROLE=admin
```

### 3. Create MySQL Database

```sql
CREATE DATABASE IF NOT EXISTS invo_db;
```

### 4. Initialize Database Tables

The database tables will be automatically created when you start the server. The migration runs on server startup.

### 5. Create Admin User (Optional)

```bash
npm run create-admin
```

This will create an admin user with the credentials specified in your `.env` file (or defaults).

### 6. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

## API Endpoints

### Authentication

#### POST `/api/auth/login`
Login endpoint

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "name": "John Doe",
      "email": "user@example.com",
      "role": "user",
      "profile_photo_url": null,
      "created_on": "2024-01-01T00:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

#### GET `/api/auth/profile`
Get current user profile (Protected Route)

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "name": "John Doe",
      "email": "user@example.com",
      "role": "user",
      "profile_photo_url": null,
      "created_on": "2024-01-01T00:00:00.000Z",
      "modified_on": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### Health Check

#### GET `/api/health`
Check server and database status

## Database Schema

### Users Table

```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  profile_photo_url VARCHAR(500) DEFAULT NULL,
  role ENUM('user', 'admin', 'master_user') DEFAULT 'user',
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE
);
```

## Security Features

1. **Password Hashing**: Passwords are hashed using bcrypt (10 salt rounds)
2. **JWT Tokens**: Secure token-based authentication
3. **Input Validation**: Email format validation
4. **SQL Injection Protection**: Using parameterized queries
5. **Soft Delete**: Users are marked as deleted instead of being removed

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js          # MySQL connection pool
│   ├── controllers/
│   │   └── authController.js    # Authentication logic
│   ├── database/
│   │   ├── migrations/
│   │   │   └── create_users_table.sql
│   │   └── init.js              # Database initialization
│   ├── middleware/
│   │   └── auth.js              # Authentication & authorization middleware
│   ├── routes/
│   │   └── authRoutes.js       # Authentication routes
│   ├── scripts/
│   │   └── createAdminUser.js  # Admin user creation script
│   ├── utils/
│   │   └── auth.js             # Auth utilities (hashing, JWT)
│   └── server.js               # Express server
├── .env.example
└── package.json
```

## Notes

- The email field is required for login. If you prefer to use username/name for login, you'll need to modify the authentication logic.
- JWT tokens expire after 24 hours by default (configurable via `JWT_EXPIRES_IN`)
- Always change the `JWT_SECRET` in production
- The database connection uses a connection pool for better performance

