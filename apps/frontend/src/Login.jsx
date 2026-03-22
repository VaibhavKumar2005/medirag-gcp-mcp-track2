import React from 'react';
import { FcGoogle } from 'react-icons/fc';
import { FaGithub } from 'react-icons/fa';
import { useAuth } from './lib/auth';
import { Navigate } from 'react-router-dom';

export default function Login() {
  const { user, loginWithGoogle, loginWithGithub } = useAuth();

  // If the user is already logged in, redirect them to the dashboard
  if (user) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-10 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
        
        {/* Header & Logo */}
        <div>
          <div className="flex justify-center">
            {/* Medical Security Shield Icon */}
            <div className="h-14 w-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-md">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Sign in to MediRAG
          </h2>
          <p className="mt-3 text-center text-sm text-gray-600 dark:text-gray-400">
            Secure clinical intelligence platform. <br/>
            Please authenticate to access your patient records.
          </p>
        </div>

        {/* OAuth SSO Buttons */}
        <div className="mt-8 space-y-4">
          <button
            onClick={loginWithGoogle}
            className="w-full flex items-center justify-center px-4 py-3.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <FcGoogle className="h-6 w-6 mr-3" />
            Continue with Google
          </button>

          <button
            onClick={loginWithGithub}
            className="w-full flex items-center justify-center px-4 py-3.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 dark:focus:ring-gray-500"
          >
            <FaGithub className="h-6 w-6 mr-3 text-gray-900 dark:text-white" />
            Continue with GitHub
          </button>
        </div>
        
        {/* Security Compliance Footer */}
        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              By signing in, you verify your identity via SSO. <br/>
              All clinical documents are encrypted at rest (AES-256).
            </p>
        </div>

      </div>
    </div>
  );
}