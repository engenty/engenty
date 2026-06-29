import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabaseAuthClient } from "../lib/supabase-auth-client";

export function SetNewPasswordForm() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const supabase = getSupabaseAuthClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Set new password</CardTitle>
        <CardDescription>Enter your new password below.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              autoComplete="new-password"
              disabled={submitting}
              id="password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              type="password"
              value={password}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              autoComplete="new-password"
              disabled={submitting}
              id="confirm"
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              type="password"
              value={confirm}
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button className="w-full" disabled={submitting} type="submit">
            {submitting && (
              <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
            )}
            Set password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
