import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@engenty/ui-core";

export function AuthCardResetEmailSent(props: {
  email: string;
  onBackToSignIn: () => void;
}) {
  const { email, onBackToSignIn } = props;
  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Check your email</CardTitle>
        <CardDescription>
          We sent a password reset link to <strong>{email}</strong>. Click the
          link to set a new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <button
          className="text-primary text-sm hover:underline"
          onClick={onBackToSignIn}
          type="button"
        >
          Back to sign in
        </button>
      </CardContent>
    </Card>
  );
}
