import { hasDatabaseUrl } from '../db/postgres.js';
import * as fileRepository from './fileUserRepository.js';
import * as postgresRepository from './postgresUserRepository.js';

function getActiveRepository() {
  return hasDatabaseUrl() ? postgresRepository : fileRepository;
}

export async function initializeUserRepository() {
  if (hasDatabaseUrl()) {
    await postgresRepository.initializePostgresRepository();
  }
}

export async function getStoredUserById(userId) {
  return getActiveRepository().getStoredUserById(userId);
}

export async function saveStoredUser(userId, userData) {
  return getActiveRepository().saveStoredUser(userId, userData);
}
