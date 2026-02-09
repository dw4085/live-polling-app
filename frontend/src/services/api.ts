import type {
  Poll,
  Question,
  CreatePollInput,
  CreateQuestionInput,
  ApiResponse,
  PollWithQuestions
} from '../types';

const API_BASE = '/api';

// Helper function for API calls
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const token = localStorage.getItem('admin_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || 'An error occurred' };
    }

    return { data };
  } catch (error) {
    return { error: 'Network error' };
  }
}

// Admin authentication
export async function adminLogin(password: string): Promise<ApiResponse<{ token: string }>> {
  return fetchApi('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}

export async function verifyAdminToken(): Promise<ApiResponse<{ valid: boolean }>> {
  return fetchApi('/admin/verify');
}

// Poll operations
export async function createPoll(input: CreatePollInput): Promise<ApiResponse<Poll>> {
  return fetchApi('/polls/create', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function getPoll(pollId: string): Promise<ApiResponse<PollWithQuestions>> {
  return fetchApi(`/polls/${pollId}`);
}

export async function updatePoll(
  pollId: string,
  updates: Partial<Poll>
): Promise<ApiResponse<Poll>> {
  return fetchApi(`/polls/${pollId}/update`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
}

export async function changePollState(
  pollId: string,
  state: Poll['state']
): Promise<ApiResponse<Poll>> {
  return fetchApi(`/polls/${pollId}/state`, {
    method: 'PATCH',
    body: JSON.stringify({ state })
  });
}

export async function resetPoll(pollId: string): Promise<ApiResponse<{ success: boolean }>> {
  return fetchApi(`/polls/${pollId}/reset`, {
    method: 'POST'
  });
}

export async function duplicatePoll(pollId: string): Promise<ApiResponse<Poll>> {
  return fetchApi(`/polls/${pollId}/duplicate`, {
    method: 'POST'
  });
}

export async function deletePoll(pollId: string): Promise<ApiResponse<{ success: boolean }>> {
  return fetchApi(`/polls/${pollId}/delete`, {
    method: 'DELETE'
  });
}

export async function exportPollCsv(pollId: string): Promise<Blob | null> {
  try {
    const token = localStorage.getItem('admin_token');
    const response = await fetch(`${API_BASE}/polls/${pollId}/export`, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` })
      }
    });

    if (!response.ok) return null;

    return response.blob();
  } catch {
    return null;
  }
}

// Question operations
export async function createQuestion(input: CreateQuestionInput): Promise<ApiResponse<Question>> {
  return fetchApi('/questions/create', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function updateQuestion(
  questionId: string,
  updates: Partial<Question>
): Promise<ApiResponse<Question>> {
  return fetchApi(`/questions/${questionId}/update`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
}

export async function deleteQuestion(questionId: string): Promise<ApiResponse<{ success: boolean }>> {
  return fetchApi(`/questions/${questionId}/delete`, {
    method: 'DELETE'
  });
}

export async function revealQuestion(
  questionId: string,
  isRevealed: boolean
): Promise<ApiResponse<Question>> {
  return fetchApi(`/questions/${questionId}/reveal`, {
    method: 'PATCH',
    body: JSON.stringify({ is_revealed: isRevealed })
  });
}

export async function reorderQuestions(
  pollId: string,
  questionIds: string[]
): Promise<ApiResponse<{ success: boolean }>> {
  return fetchApi('/questions/reorder', {
    method: 'PUT',
    body: JSON.stringify({ poll_id: pollId, question_ids: questionIds })
  });
}

// Access verification
export async function verifyPollAccess(code: string): Promise<ApiResponse<{
  poll_id: string;
  requires_password: boolean;
}>> {
  return fetchApi('/access/verify_poll', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
}

export async function verifyPollPassword(
  pollId: string,
  password: string
): Promise<ApiResponse<{ valid: boolean }>> {
  return fetchApi('/access/verify_password', {
    method: 'POST',
    body: JSON.stringify({ poll_id: pollId, password })
  });
}

// Session operations
export async function createSessionApi(
  pollId: string,
  sessionToken: string
): Promise<ApiResponse<{ session_id: string }>> {
  return fetchApi('/sessions/create', {
    method: 'POST',
    body: JSON.stringify({ poll_id: pollId, session_token: sessionToken })
  });
}

// Response operations
export async function submitResponseApi(
  sessionToken: string,
  questionId: string,
  answerOptionId: string
): Promise<ApiResponse<{ success: boolean }>> {
  return fetchApi('/responses/submit', {
    method: 'POST',
    body: JSON.stringify({
      session_token: sessionToken,
      question_id: questionId,
      answer_option_id: answerOptionId
    })
  });
}

export async function getAggregatedResults(pollId: string): Promise<ApiResponse<{
  results: Record<string, Record<string, number>>;
}>> {
  return fetchApi(`/responses/${pollId}/aggregate`);
}
