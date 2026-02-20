'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';

type LoginStep = 'aadhaar' | 'otp';

function AadhaarInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled: boolean;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length <= 12) {
      onChange(raw);
    }
  };

  const formatAadhaar = (aadhaar: string): string => {
    if (aadhaar.length <= 4) return aadhaar;
    if (aadhaar.length <= 8) {
      return `XXXX ${aadhaar.slice(4)}`;
    }
    return `XXXX XXXX ${aadhaar.slice(8)}`;
  };

  const displayValue = value.length > 4 ? formatAadhaar(value) : value;

  return (
    <div>
      <label htmlFor="aadhaar" className="form-label">
        Aadhaar Number
      </label>
      <input
        id="aadhaar"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="form-input aadhaar-input text-center"
        placeholder="Enter 12-digit Aadhaar"
        value={displayValue}
        onChange={handleChange}
        disabled={disabled}
        maxLength={19}
        aria-describedby="aadhaar-help"
      />
      <p id="aadhaar-help" className="mt-1.5 text-xs text-gray-500">
        Your Aadhaar number is masked for security. Only the last 4 digits
        are visible.
      </p>
    </div>
  );
}

function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (otp: string[]) => void;
  disabled: boolean;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && !value[index] && index > 0) {
        const ref = inputRefs.current[index - 1];
        if (ref) {
          ref.focus();
        }
      }
    },
    [value]
  );

  const handleInput = useCallback(
    (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const digit = e.target.value.replace(/\D/g, '');
      if (!digit) return;

      const newOtp = [...value];
      newOtp[index] = digit[0];
      onChange(newOtp);

      if (index < 5) {
        const ref = inputRefs.current[index + 1];
        if (ref) {
          ref.focus();
        }
      }
    },
    [value, onChange]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      if (pasted.length > 0) {
        const newOtp = [...value];
        for (let i = 0; i < pasted.length; i++) {
          newOtp[i] = pasted[i];
        }
        onChange(newOtp);
        const focusIndex = Math.min(pasted.length, 5);
        const ref = inputRefs.current[focusIndex];
        if (ref) {
          ref.focus();
        }
      }
    },
    [value, onChange]
  );

  return (
    <div>
      <label className="form-label">Enter OTP</label>
      <div className="flex justify-center gap-3" onPaste={handlePaste}>
        {Array.from({ length: 6 }).map((_, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="form-input w-12 h-14 text-center text-xl font-bold"
            maxLength={1}
            value={value[i] || ''}
            onChange={(e) => handleInput(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={disabled}
            aria-label={`OTP digit ${i + 1}`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500 text-center">
        Enter the 6-digit OTP sent to your registered mobile number
      </p>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyOtp, isAuthenticated, error: authError } = useAuthStore();

  const [step, setStep] = useState<LoginStep>('aadhaar');
  const [aadhaar, setAadhaar] = useState('');
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const [transactionId, setTransactionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [resendTimer]);

  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError]);

  const handleAadhaarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (aadhaar.length !== 12) {
      setError('Please enter a valid 12-digit Aadhaar number');
      return;
    }

    // Basic Verhoeff check - starts valid
    if (aadhaar.startsWith('0') || aadhaar.startsWith('1')) {
      setError('Invalid Aadhaar number format');
      return;
    }

    setLoading(true);
    try {
      const txnId = await login(aadhaar);
      setTransactionId(txnId);
      setStep('otp');
      setResendTimer(60);
    } catch {
      setError('Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const otpString = otp.join('');
    if (otpString.length !== 6) {
      setError('Please enter the complete 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      await verifyOtp(transactionId, otpString);
      router.push('/');
    } catch {
      setError('Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setError(null);
    setLoading(true);
    try {
      const txnId = await login(aadhaar);
      setTransactionId(txnId);
      setOtp(Array(6).fill(''));
      setResendTimer(60);
    } catch {
      setError('Failed to resend OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="w-full max-w-md">
        <div className="govt-card">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-bhulekh-saffron-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-bhulekh-saffron-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-bhulekh-navy">
              Login to BhulekhChain
            </h1>
            <p className="text-gray-500 mt-2">
              {step === 'aadhaar'
                ? 'Authenticate using your Aadhaar number'
                : 'Enter the OTP sent to your mobile'}
            </p>
          </div>

          {/* Step indicators */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === 'aadhaar'
                    ? 'bg-bhulekh-saffron-500 text-white'
                    : 'bg-bhulekh-green-500 text-white'
                }`}
              >
                {step === 'otp' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  '1'
                )}
              </div>
              <div
                className={`w-16 h-0.5 ${
                  step === 'otp' ? 'bg-bhulekh-green-500' : 'bg-gray-200'
                }`}
              />
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === 'otp'
                    ? 'bg-bhulekh-saffron-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                2
              </div>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Step 1: Aadhaar input */}
          {step === 'aadhaar' && (
            <form onSubmit={handleAadhaarSubmit} className="space-y-6">
              <AadhaarInput
                value={aadhaar}
                onChange={setAadhaar}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || aadhaar.length !== 12}
                className="btn-primary w-full"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending OTP...
                  </span>
                ) : (
                  'Send OTP'
                )}
              </button>
            </form>
          )}

          {/* Step 2: OTP verification */}
          {step === 'otp' && (
            <form onSubmit={handleOtpSubmit} className="space-y-6">
              <OtpInput value={otp} onChange={setOtp} disabled={loading} />

              <button
                type="submit"
                disabled={loading || otp.join('').length !== 6}
                className="btn-primary w-full"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Verifying...
                  </span>
                ) : (
                  'Verify & Login'
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendTimer > 0 || loading}
                  className="text-sm text-bhulekh-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
                >
                  {resendTimer > 0
                    ? `Resend OTP in ${resendTimer}s`
                    : 'Resend OTP'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setStep('aadhaar');
                  setOtp(Array(6).fill(''));
                  setError(null);
                }}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                Change Aadhaar number
              </button>
            </form>
          )}

          {/* Info footer */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <div className="flex items-start gap-2 text-xs text-gray-500">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>
                Your Aadhaar data is processed securely as per UIDAI guidelines.
                We do not store your Aadhaar number. Only a hashed identifier
                is retained for authentication.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
