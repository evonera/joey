import { SignUp } from "@/components/auth/SignUp";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#0a0908] p-4 relative overflow-hidden">
      {/* Background soft glow */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-[#ffe633]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10 w-full">
        <SignUp />
      </div>
    </div>
  );
}
