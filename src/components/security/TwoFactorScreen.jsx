import { ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import ThemeToggle from "../ThemeToggle.jsx";
import TwoFactorSetup from "./TwoFactorSetup.jsx";

/** Full-screen: two-factor is required for this person and this session doesn't have it. */
export default function TwoFactorScreen({ enrolled, reason }) {
  const { user, signOut } = useAuth();
  return (
    <div className="auth-screen">
      <div className="auth-theme-toggle-wrap">
        <ThemeToggle />
      </div>
      <section className="auth-card two-factor-card">
        <h1><ShieldCheck size={22} /> Two-factor login required</h1>
        <p className="auth-help">
          {reason}
          {" "}Signed in as {user?.email}.
        </p>
        {enrolled ? (
          <>
            <p>Your authenticator app is set up. Sign in again and enter a code from the app to continue.</p>
            <button className="primary-button" type="button" onClick={signOut}>Sign in again</button>
          </>
        ) : (
          <TwoFactorSetup />
        )}
        <button className="text-button" type="button" onClick={signOut}>Sign out</button>
      </section>
    </div>
  );
}
