import { ArrowLeft } from "lucide-react";
import Logo from "../assets/Logo.png";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useState, useEffect, useRef } from "react";
import { ShaderGradientCanvas, ShaderGradient } from "@shadergradient/react";

export default function SignUp() {
  return (
    <div className="relative min-h-screen bg-white flex items-center justify-center min-[1095px]:p-6">
      {/* Mobile-only: full-screen gradient background */}
      <div className="absolute inset-0 min-[1095px]:hidden overflow-hidden">
        <ShaderGradientCanvas style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
          <ShaderGradient
            animate="on" brightness={1.1} cAzimuthAngle={180} cDistance={3.6} cPolarAngle={90} cameraZoom={1}
            color1="#ff8682" color2="#db8edb" color3="#8c8de1"
            envPreset="city" grain="on" lightType="3d"
            positionX={-1.4} positionY={0} positionZ={0}
            range="disabled" rangeEnd={40} rangeStart={0} reflection={0.1}
            rotationX={0} rotationY={10} rotationZ={50}
            shader="defaults" type="plane"
            uAmplitude={1} uDensity={1.3} uFrequency={5.5} uSpeed={0.2} uStrength={4} uTime={0}
            wireframe={false} zoomOut={false}
          />
        </ShaderGradientCanvas>
      </div>

      {/* Card: white card floating on gradient (mobile) | two-panel card (desktop) */}
      {/* No overflow-hidden: aspect-3/2 is then only a minimum and the card grows when the form is taller */}
      <div className="relative z-10 w-full mx-4 bg-white rounded-[35px] min-[1095px]:flex min-[1095px]:mx-0 min-[1095px]:max-w-6xl min-[1095px]:aspect-3/2 min-[1095px]:rounded-[55px]">
        <div className="w-full flex flex-col min-[1095px]:flex-row min-[1095px]:flex-1 min-[1095px]:gap-7">
          <LeftPanel />
          <RightPanel />
        </div>
      </div>
    </div>
  );
}

function LeftPanel() {
  return (
    // Left side with ShaderGradient background — hidden on mobile
    <div className="hidden min-[1095px]:block relative min-[1095px]:w-1/2 min-[1095px]:rounded-[55px] overflow-hidden">
      <div className="absolute inset-0">
        <ShaderGradientCanvas style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
          <ShaderGradient
            animate="on" brightness={1.1} cAzimuthAngle={180} cDistance={3.6} cPolarAngle={90} cameraZoom={1}
            color1="#ff8682" color2="#db8edb" color3="#8c8de1"
            envPreset="city" grain="on" lightType="3d"
            positionX={-1.4} positionY={0} positionZ={0}
            range="disabled" rangeEnd={40} rangeStart={0} reflection={0.1}
            rotationX={0} rotationY={10} rotationZ={50}
            shader="defaults" type="plane"
            uAmplitude={1} uDensity={1.3} uFrequency={5.5} uSpeed={0.2} uStrength={4} uTime={0}
            wireframe={false} zoomOut={false}
          />
        </ShaderGradientCanvas>
      </div>

      {/* Logo top-left */}
      <img src={Logo} alt="SkillCatch" className="absolute top-10 left-10 h-10 w-auto z-10" />

      {/* Bottom center text */}
      <div className="absolute inset-0 flex items-end justify-center px-15 pb-10 z-10">
        <div className="text-white text-4xl font-bold leading-tight text-center">
          SHAPE YOUR DIRECTION
        </div>
      </div>
    </div>
  );
}

function RightPanel() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    agreeToTerms: false,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showResendButton, setShowResendButton] = useState(false);
  const [resendEmail, setResendEmail] = useState("");

  const pollIntervalRef = useRef<number | null>(null);
  const pendingCredentialsRef = useRef<{ email: string; password: string } | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const startVerificationPolling = (email: string, password: string) => {
    // Store credentials for polling
    pendingCredentialsRef.current = { email, password };

    // Poll every 3 seconds
    pollIntervalRef.current = setInterval(async () => {
      if (!pendingCredentialsRef.current) return;

      const { data, error } = await supabase.auth.signInWithPassword({
        email: pendingCredentialsRef.current.email,
        password: pendingCredentialsRef.current.password,
      });

      if (!error && data.session) {
        console.log("✅ Email verified! Auto-signing in...");
        
        // Clean up
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        pendingCredentialsRef.current = null;

        // Upsert profile with metadata from signup
        const user = data.session.user;
        const meta = user.user_metadata ?? {};
        await supabase.from("profiles").upsert(
          {
            id: user.id,
            first_name: meta.first_name ?? null,
            last_name: meta.last_name ?? null,
            avatar_url: meta.avatar_url ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id", ignoreDuplicates: false }
        );

        // Redirect to dashboard
        navigate("/dashboard", { replace: true });
      }
    }, 3000); // Poll every 3 seconds
  };

  const handleResendEmail = async () => {
    if (!resendEmail) return;
    
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: resendEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        setMessage({
          type: "success",
          text: "Verification email resent! Check your inbox.",
        });
        setShowResendButton(false);
      }
    } catch (err) {
      setMessage({ type: "error", text: "Failed to resend email" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (isLogin) {
      // Login logic
      if (!formData.email || !formData.password) {
        setMessage({ type: "error", text: "Please fill in all fields" });
        return;
      }

      setLoading(true);

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (error) {
          setMessage({ type: "error", text: error.message });
        } else if (data.user) {
          setMessage({
            type: "success",
            text: "Logged in successfully! Redirecting...",
          });
          setTimeout(() => navigate("/dashboard"), 1000);
        }
      } catch (err) {
        setMessage({ type: "error", text: "An unexpected error occurred" });
      } finally {
        setLoading(false);
      }
    } else {
      // Signup logic
      if (!formData.firstName || !formData.lastName || !formData.email || !formData.password || !formData.confirmPassword) {
        setMessage({ type: "error", text: "Please fill in all fields" });
        return;
      }

      if (formData.password.length < 6) {
        setMessage({ type: "error", text: "Password must be at least 6 characters" });
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        setMessage({ type: "error", text: "Passwords do not match" });
        return;
      }

      if (!formData.agreeToTerms) {
        setMessage({ type: "error", text: "Please agree to the Terms and Conditions" });
        return;
      }

      setLoading(true);

      try {
        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              first_name: formData.firstName,
              last_name: formData.lastName,
            },
          },
        });

        // Log the response for debugging
        console.log("SignUp response:", { data, error });

        if (error) {
          // Check if it's a "user already exists" scenario
          if (error.message.toLowerCase().includes("already") || 
              error.message.toLowerCase().includes("exist")) {
            setMessage({ 
              type: "error", 
              text: "Account already exists — check your inbox for the verification email, or click below to resend it." 
            });
            setShowResendButton(true);
            setResendEmail(formData.email);
          } else {
            setMessage({ type: "error", text: error.message });
          }
        } else if (data.user) {
          // Check if user is already confirmed (shouldn't happen on first signup)
          if (data.user.confirmed_at) {
            setMessage({
              type: "success",
              text: "Account already verified! You can log in.",
            });
          } else {
            // Normal first-time signup - start polling for verification
            setMessage({
              type: "success",
              text: "Check your email for the confirmation link!",
            });
            
            // Start polling to detect verification
            startVerificationPolling(formData.email, formData.password);
          }
          
          // Clear form except password (needed for polling)
          setFormData((prev) => ({
            firstName: "",
            lastName: "",
            email: "",
            password: prev.password, // Keep password for polling
            confirmPassword: "",
            agreeToTerms: false,
          }));
        } else {
          // User object is null - might be obfuscated response for existing user
          setMessage({ 
            type: "error", 
            text: "Account may already exist. Check your email or try resending the verification." 
          });
          setShowResendButton(true);
          setResendEmail(formData.email);
        }
      } catch (err) {
        console.error("Signup error:", err);
        setMessage({ type: "error", text: "An unexpected error occurred" });
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="w-full min-[1095px]:w-1/2 p-6 sm:p-10 flex flex-col justify-center">
      {/* Back arrow */}
      <button
        type="button"
        onClick={() => navigate("/")}
        className="w-10 h-10 inline-flex items-center cursor-pointer justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0 mb-6 sm:mb-8"
        aria-label="Go back"
      >
        <ArrowLeft className="h-5 w-5 text-black" />
      </button>

      {/* Title + subtitle */}
      <div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-gray-900">
          {isLogin ? "Welcome Back" : "Create an Account"}
        </h1>

        <p className="mt-3 sm:mt-4 text-sm text-gray-600">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setMessage(null);
              setFormData({
                firstName: "",
                lastName: "",
                email: "",
                password: "",
                confirmPassword: "",
                agreeToTerms: false,
              });
            }}
            className="text-gray-900 underline underline-offset-4 cursor-pointer"
          >
            {isLogin ? "Sign up" : "Log in"}
          </button>
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="mt-6 sm:mt-8 space-y-4 sm:space-y-5">
        {/* Success/Error Message */}
        {message && (
          <div
            className={`rounded-full px-5 py-3 text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Resend Email Button */}
        {showResendButton && !isLogin && (
          <button
            type="button"
            onClick={handleResendEmail}
            disabled={loading}
            className="
              w-full rounded-full bg-blue-600 text-white
              py-3 text-sm font-medium
              hover:bg-blue-700 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              cursor-pointer
            "
          >
            {loading ? "Resending..." : "Resend Verification Email"}
          </button>
        )}

        {/* Row 1: first + last name (only for signup) */}
        {!isLogin && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name">
              <Input
                placeholder="First Name"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
              />
            </Field>

            <Field label="Last Name">
              <Input
                placeholder="Last Name"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
              />
            </Field>
          </div>
        )}

        {/* Row 2: email */}
        <Field label="Email Address">
          <Input
            placeholder="Email Address"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
          />
        </Field>

        {/* Row 3: password */}
        <Field label="Password">
          <Input
            placeholder="Password"
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
          />
        </Field>

        {/* Row 4: confirm password (only for signup) */}
        {!isLogin && (
          <Field label="Confirm Password">
            <Input
              placeholder="Confirm Password"
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
            />
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <p className="mt-2 px-5 text-xs text-red-600">Passwords do not match</p>
            )}
          </Field>
        )}

        {/* Terms (only for signup) */}
        {!isLogin && (
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              name="agreeToTerms"
              checked={formData.agreeToTerms}
              onChange={handleChange}
              className="h-4 w-4 rounded border-gray-300 accent-black cursor-pointer"
            />
            <span>
              I agree to the{" "}
              {/* New tab so the half-filled form is not lost */}
              <Link to="/terms" target="_blank" className="text-gray-900 underline underline-offset-4">
                Terms and Conditions
              </Link>
            </span>
          </label>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="
            w-full rounded-full bg-black text-white
            py-3 text-sm font-medium
            hover:bg-zinc-900 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            cursor-pointer
          "
        >
          {loading 
            ? (isLogin ? "Logging in..." : "Creating Account...") 
            : (isLogin ? "Log in" : "Submit")
          }
        </button>

        {/* Divider with OR */}
        <Divider text="or" />

        {/* Social buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                  redirectTo: `${window.location.origin}/auth/callback`,
                },
              });
            }}
            className="
              w-full rounded-full border border-gray-200
              py-3 text-sm font-medium text-gray-900
              hover:bg-gray-50 transition-colors
              inline-flex items-center justify-center gap-2
              cursor-pointer
            "
          >
            {/* Google logo */}
            <svg className="h-4 w-4" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            <span className="hidden sm:inline">Continue with Google</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signInWithOAuth({
                provider: "github",
                options: {
                  redirectTo: `${window.location.origin}/auth/callback`,
                },
              });
            }}
            className="
              w-full rounded-full border border-gray-200
              py-3 text-sm font-medium text-gray-900
              hover:bg-gray-50 transition-colors
              inline-flex items-center justify-center gap-2
              cursor-pointer
            "
          >
            {/* GitHub icon */}
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span className="hidden sm:inline">Continue with GitHub</span>
          </button>
        </div>
      </form>
    </div>
  );
}

/** Reusable label + slot wrapper */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-900">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Reusable input styling */
function Input({
  placeholder,
  type = "text",
  name,
  value,
  onChange,
}: {
  placeholder: string;
  type?: string;
  name?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      name={name}
      value={value}
      onChange={onChange}
      className="
        w-full rounded-full border border-gray-300
        px-5 py-3 text-sm text-gray-900
        outline-none
        focus:border-black focus:ring-2 focus:ring-black/10
      "
    />
  );
}

/** Divider line with centered text */
function Divider({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="h-px flex-1 bg-gray-200" />
      <div className="text-xs text-gray-400">{text}</div>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
