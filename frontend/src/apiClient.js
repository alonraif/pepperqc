import axios from 'axios';

const DEFAULT_API_BASE =
  process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : '';

const trimmedBase = (process.env.REACT_APP_API_BASE_URL || DEFAULT_API_BASE).replace(/\/+$/, '');

export const API_BASE_URL = trimmedBase;

export const buildApiUrl = (path = '') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return trimmedBase ? `${trimmedBase}${normalizedPath}` : normalizedPath;
};

const apiClient = axios.create({
  baseURL: trimmedBase || undefined,
});

export default apiClient;
