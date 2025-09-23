import apiClient, { buildApiUrl } from '../apiClient';

export const fetchTelegramStatus = async () => {
  const response = await apiClient.get(buildApiUrl('/api/telegram/status'));
  return response.data;
};

export const listRecipients = async () => {
  const response = await apiClient.get(buildApiUrl('/api/telegram/recipients'));
  return response.data;
};

export const createRecipient = async (payload) => {
  const response = await apiClient.post(buildApiUrl('/api/telegram/recipients'), payload);
  return response.data;
};

export const updateRecipient = async (id, payload) => {
  const response = await apiClient.put(buildApiUrl(`/api/telegram/recipients/${id}`), payload);
  return response.data;
};

export const deleteRecipient = async (id) => {
  const response = await apiClient.delete(buildApiUrl(`/api/telegram/recipients/${id}`));
  return response.data;
};

export const sendTestMessage = async (id) => {
  const response = await apiClient.post(buildApiUrl(`/api/telegram/recipients/${id}/test`));
  return response.data;
};
