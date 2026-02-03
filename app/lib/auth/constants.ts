export const AUTH_ROUTES = {
  public: ['/login', '/signup'],
  protected: ['/'],
  login: '/login',
  signup: '/signup',
  dashboard: '/',
} as const

export const AUTH_ERRORS = {
  invalidCredentials: 'Invalid email or password',
  emailExists: 'An account with this email already exists',
  weakPassword: 'Password must be at least 6 characters',
  invalidEmail: 'Please enter a valid email address',
  networkError: 'Unable to connect. Please try again.',
} as const
