import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CatchingPokemonIcon from "@mui/icons-material/CatchingPokemon";
import LoginIcon from "@mui/icons-material/Login";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import { Link as RouterLink, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth.jsx";

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (auth.isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await auth.login(form);
      navigate(location.state?.from?.pathname ?? "/", { replace: true });
    } catch (err) {
      setError(formatApiError(err.data) || "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Sign In"
      subtitle="Access your Pokemon map workspace."
      icon={<LoginIcon />}
      footer={
        <>
          Need an account?{" "}
          <Link component={RouterLink} to="/register">
            Create one
          </Link>
        </>
      }
    >
      <AuthForm onSubmit={handleSubmit} error={error}>
        <TextField
          label="Username"
          autoComplete="username"
          value={form.username}
          onChange={(event) => setForm({ ...form, username: event.target.value })}
          required
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          required
          fullWidth
        />
        <Button type="submit" variant="contained" startIcon={<LoginIcon />} disabled={isSubmitting}>
          {isSubmitting ? "Signing In" : "Sign In"}
        </Button>
      </AuthForm>
    </AuthShell>
  );
}

export function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    password_confirm: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (auth.isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await auth.register(form);
      navigate("/", { replace: true });
    } catch (err) {
      setError(formatApiError(err.data) || "Registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create Account"
      subtitle="Register before viewing the Pokemon map."
      icon={<PersonAddAltIcon />}
      footer={
        <>
          Already have an account?{" "}
          <Link component={RouterLink} to="/login">
            Sign in
          </Link>
        </>
      }
    >
      <AuthForm onSubmit={handleSubmit} error={error}>
        <TextField
          label="Username"
          autoComplete="username"
          value={form.username}
          onChange={(event) => setForm({ ...form, username: event.target.value })}
          required
          fullWidth
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          required
          fullWidth
        />
        <TextField
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          value={form.password_confirm}
          onChange={(event) => setForm({ ...form, password_confirm: event.target.value })}
          required
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          startIcon={<PersonAddAltIcon />}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating Account" : "Create Account"}
        </Button>
      </AuthForm>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, icon, footer, children }) {
  return (
    <Box className="auth-page">
      <Container maxWidth="xs">
        <Paper elevation={0} className="auth-panel">
          <Stack spacing={3}>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box className="brand-mark">
                  <CatchingPokemonIcon fontSize="small" />
                </Box>
                <Typography variant="h6" component="p">
                  Pokemon Finder
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1.5} alignItems="center">
                {icon}
                <Typography variant="h4" component="h1">
                  {title}
                </Typography>
              </Stack>
              <Typography color="text.secondary">{subtitle}</Typography>
            </Stack>
            {children}
            <Typography variant="body2" color="text.secondary">
              {footer}
            </Typography>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

function AuthForm({ children, error, onSubmit }) {
  return (
    <Stack component="form" spacing={2} onSubmit={onSubmit}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {children}
    </Stack>
  );
}

function formatApiError(data) {
  if (!data) {
    return "";
  }
  if (typeof data === "string") {
    return data;
  }
  if (Array.isArray(data)) {
    return data.join(" ");
  }
  if (typeof data === "object") {
    return Object.entries(data)
      .map(([field, messages]) => {
        const text = Array.isArray(messages) ? messages.join(" ") : String(messages);
        return `${field}: ${text}`;
      })
      .join(" ");
  }
  return "";
}

