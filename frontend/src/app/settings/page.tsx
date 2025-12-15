"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AuthGuard from "@/components/AuthGuard";
import { useSession } from "@/contexts/SessionContext";

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsPageContent />
    </AuthGuard>
  );
}

function SettingsPageContent() {
  const { user, isLoading, error } = useSession();

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold">User Settings</h1>
            <nav className="flex gap-2">
              <Button asChild variant="link">
                <a href="/dashboard">Dashboard</a>
              </Button>
              <Button asChild variant="link">
                <a href="/study">Study</a>
              </Button>
              <Button asChild variant="link">
                <a href="/questions">Questions</a>
              </Button>
            </nav>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <div className="text-gray-600">Loading user profile...</div>
              </div>
            </CardContent>
          </Card>
        ) : user ? (
          <>
            {/* User Profile Card */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Profile Picture */}
                  {user.picture && (
                    <div className="flex items-center gap-4">
                      <img
                        src={user.picture}
                        alt={user.name}
                        className="w-20 h-20 rounded-full"
                      />
                      <div>
                        <div className="text-sm text-gray-500">
                          Profile Picture
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Username */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      Username
                    </label>
                    <div className="text-lg text-gray-900">{user.name}</div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      Email
                    </label>
                    <div className="text-lg text-gray-900">{user.email}</div>
                  </div>

                  {/* User ID */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      User ID
                    </label>
                    <div className="text-sm font-mono text-gray-600">
                      {user.id}
                    </div>
                  </div>

                  {/* Admin Status */}
                  {user.is_admin && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">
                        Account Type
                      </label>
                      <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                        Administrator
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Account Details Card */}
            <Card>
              <CardHeader>
                <CardTitle>Account Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Created At */}
                  <div className="flex justify-between items-center py-3 border-b border-gray-200">
                    <span className="text-sm font-medium text-gray-700">
                      Account Created
                    </span>
                    <span className="text-sm text-gray-900">
                      {formatDate(user.created_at)}
                    </span>
                  </div>

                  {/* Last Login */}
                  <div className="flex justify-between items-center py-3 border-b border-gray-200">
                    <span className="text-sm font-medium text-gray-700">
                      Last Login
                    </span>
                    <span className="text-sm text-gray-900">
                      {formatDate(user.last_login_at)}
                    </span>
                  </div>

                  {/* Google ID */}
                  {user.google_id && (
                    <div className="flex justify-between items-center py-3">
                      <span className="text-sm font-medium text-gray-700">
                        Google Account
                      </span>
                      <span className="text-sm text-gray-900">Connected</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <div className="text-gray-600">User profile not found</div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
