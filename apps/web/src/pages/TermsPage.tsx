import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const LAST_UPDATED = "October 26, 2026";

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "1. Acceptance of Terms",
    body: [
      "By creating an account or using SkillCatch, you agree to these Terms and Conditions. If you do not agree, please do not use the service.",
    ],
  },
  {
    title: "2. Your Account",
    body: [
      "You must provide accurate information when creating an account and keep it up to date.",
      "You are responsible for keeping your password secure and for all activity that happens under your account.",
    ],
  },
  {
    title: "3. Acceptable Use",
    body: [
      "You agree not to harass, threaten or impersonate other users, send spam, or upload unlawful, offensive or misleading content.",
      "You agree not to attempt to access other users' data or interfere with the security or operation of the service.",
    ],
  },
  {
    title: "4. Your Content",
    body: [
      "You keep ownership of the content you share (profile information, skills, messages). By posting it, you give SkillCatch permission to store and display it as needed to run the service.",
      "You are responsible for the content you share and must have the right to share it.",
    ],
  },
  {
    title: "5. Privacy",
    body: [
      "We process your personal data only to provide and improve the service. We do not sell your personal data to third parties.",
    ],
  },
  {
    title: "6. Termination",
    body: [
      "You can delete your account at any time. We may suspend or terminate accounts that violate these terms.",
    ],
  },
  {
    title: "7. Disclaimer",
    body: [
      "SkillCatch is provided \"as is\" without warranties of any kind. We are not responsible for interactions or agreements between users.",
    ],
  },
  {
    title: "8. Changes to These Terms",
    body: [
      "We may update these terms from time to time. Continued use of SkillCatch after changes means you accept the updated terms.",
    ],
  },
];

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:py-16">
        <button
          type="button"
          // Opened in a new tab from sign-up → no history to go back to, fall back to /signin
          onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate("/signin"))}
          className="w-10 h-10 inline-flex items-center cursor-pointer justify-center rounded-full hover:bg-gray-100 transition-colors mb-6 sm:mb-8"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-black" />
        </button>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-gray-900">
          Terms and Conditions
        </h1>
        <p className="mt-3 text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-medium text-gray-900">{section.title}</h2>
              <div className="mt-3 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-relaxed text-gray-600">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
