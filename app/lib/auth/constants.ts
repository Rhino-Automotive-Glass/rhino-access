// Public self-signup is temporarily open. Set to false to return to
// invite-only: /signup then 404s and the login page hides its link. Admin
// invites (POST /api/admin/users/invite) work either way. Self-signed-up
// accounts get no role — production removed on_auth_user_created — so they
// have no permissions until an admin assigns one.
export const SIGNUP_ENABLED = true

export const AUTH_ROUTES = {
  public: ['/login', '/signup', '/forgot-password', '/reset-password'],
  protected: ['/'],
  login: '/login',
  signup: '/signup',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  dashboard: '/',
} as const

export const AUTH_ERRORS = {
  invalidCredentials: 'Invalid email or password',
  emailExists: 'An account with this email already exists',
  weakPassword: 'Password must be at least 6 characters',
  invalidEmail: 'Please enter a valid email address',
  networkError: 'Unable to connect. Please try again.',
} as const
