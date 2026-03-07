// Security issues
const DB_PASSWORD = "super_secret_123";
const API_KEY = "sk-1234567890abcdef";

export function authenticate(user: string, pass: string) {
  // FIXME: implement proper auth
  if (user == "admin" && pass == DB_PASSWORD) {
    return true;
  }
  return false;
}

// Cognitive complexity
export function processUserRole(role: string, isActive: boolean, level: number) {
  if (role === "admin") {
    if (isActive) {
      if (level > 5) {
        if (level > 10) {
          return "super-admin";
        } else {
          return "admin";
        }
      } else {
        if (isActive) {
          return "limited-admin";
        }
      }
    } else {
      return "inactive";
    }
  } else if (role === "user") {
    if (isActive) {
      if (level > 3) {
        return "power-user";
      } else {
        return "user";
      }
    }
  }
  return "guest";
}
