import * as fs from 'fs';
import * as path from 'path';

export interface UserCredentials {
  username: string;
  password: string;
}

type UsersFile = Record<string, UserCredentials>;

const USERS_PATH = path.resolve(__dirname, 'users.json');
const USERS_EXAMPLE_PATH = path.resolve(__dirname, 'users.example.json');

function loadUsers(): UsersFile {
  const filePath = fs.existsSync(USERS_PATH) ? USERS_PATH : USERS_EXAMPLE_PATH;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as UsersFile;
}

const users = loadUsers();

export function getUser(role: string): UserCredentials {
  const user = users[role];
  if (!user) {
    throw new Error(
      `User profile "${role}" was not found in config/users.json. Available profiles: ${Object.keys(users).join(', ')}`,
    );
  }
  return user;
}

export function getAllUsers(): UsersFile {
  return users;
}
