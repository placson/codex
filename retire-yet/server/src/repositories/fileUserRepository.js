import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_USER_ID } from '../config/userConfig.js';
import {
  createDefaultPlanData,
  validateStoredUserCollection,
  validateUserPlanData
} from '../validators/userDataValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDataDirectory = path.join(__dirname, '..', '..', 'data');
const configuredDataFilePath = process.env.USER_DATA_FILE_PATH;
const dataFilePath = configuredDataFilePath
  ? path.resolve(configuredDataFilePath)
  : path.join(defaultDataDirectory, 'userData.json');
const dataDirectory = path.dirname(dataFilePath);

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createDefaultStore() {
  const defaultUser = createDefaultPlanData(DEFAULT_USER_ID);

  return {
    schemaVersion: '2.0.0',
    users: {
      [DEFAULT_USER_ID]: defaultUser
    }
  };
}

function normalizeStoredData(parsedData) {
  if (parsedData?.users && typeof parsedData.users === 'object' && !Array.isArray(parsedData.users)) {
    validateStoredUserCollection(parsedData);
    return parsedData;
  }

  validateUserPlanData(parsedData);

  const userId = parsedData.userId || DEFAULT_USER_ID;
  const normalizedUser = {
    ...parsedData,
    userId
  };

  return {
    schemaVersion: '2.0.0',
    users: {
      [userId]: normalizedUser
    }
  };
}

async function ensureDataFile() {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    await fs.access(dataFilePath);
  } catch {
    await fs.writeFile(dataFilePath, JSON.stringify(createDefaultStore(), null, 2), 'utf-8');
  }
}

async function readStore() {
  await ensureDataFile();

  try {
    const fileContents = await fs.readFile(dataFilePath, 'utf-8');
    const parsedData = JSON.parse(fileContents);
    return normalizeStoredData(parsedData);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw createHttpError(500, 'Stored user data is not valid JSON.');
    }

    throw error;
  }
}

async function writeStore(store) {
  await fs.writeFile(dataFilePath, JSON.stringify(store, null, 2), 'utf-8');
}

export async function getUserStore() {
  return readStore();
}

export async function getStoredUserById(userId) {
  const store = await readStore();
  return store.users[userId] ?? null;
}

export async function saveStoredUser(userId, userData) {
  const store = await readStore();
  const nextStore = {
    ...store,
    users: {
      ...store.users,
      [userId]: userData
    }
  };

  validateStoredUserCollection(nextStore);
  await writeStore(nextStore);

  return userData;
}
