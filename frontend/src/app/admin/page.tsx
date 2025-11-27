import { getAllUsers } from '@/lib/users'

async function getSystemStats() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

  try {
    // Get question stats
    const questionsRes = await fetch(`${apiUrl}/api/questions/stats`, {
      credentials: 'include',
      cache: 'no-store',
    })
    const questionStats = questionsRes.ok ? await questionsRes.json() : null

    // Get all users (paginated)
    const { users, pagination } = await getAllUsers(1000, 0)

    // Calculate user stats
    const adminCount = users.filter(u => u.is_admin).length
    const activeUsers = users.filter(u => {
      const lastLogin = new Date(u.last_login_at)
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      return lastLogin > weekAgo
    }).length

    return {
      totalUsers: pagination.total,
      adminCount,
      activeUsers,
      totalQuestions: questionStats?.totalQuestions || 0,
      answeredQuestions: questionStats?.answeredQuestions || 0,
      recentActivity: questionStats?.recentActivity || 0,
    }
  } catch (error) {
    console.error('Failed to fetch system stats:', error)
    return null
  }
}

export default async function AdminDashboard() {
  const stats = await getSystemStats()

  if (!stats) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Admin Dashboard
        </h2>
        <p className="text-red-600">Failed to load system statistics</p>
      </div>
    )
  }

  const statCards = [
    {
      title: 'Total Users',
      value: stats.totalUsers,
      description: `${stats.adminCount} admins, ${stats.activeUsers} active this week`,
      color: 'blue',
    },
    {
      title: 'Total Questions',
      value: stats.totalQuestions,
      description: `${stats.answeredQuestions} answered at least once`,
      color: 'green',
    },
    {
      title: 'Recent Activity',
      value: stats.recentActivity,
      description: 'Answers in the last 7 days',
      color: 'purple',
    },
    {
      title: 'Completion Rate',
      value:
        stats.totalQuestions > 0
          ? `${Math.round((stats.answeredQuestions / stats.totalQuestions) * 100)}%`
          : '0%',
      description: 'Questions with at least one answer',
      color: 'yellow',
    },
  ]

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Admin Dashboard
        </h2>
        <p className="text-gray-600">
          System overview and statistics for Anki Interview App
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card) => (
          <div
            key={card.title}
            className="bg-white rounded-lg shadow-sm p-6 border-l-4"
            style={{
              borderLeftColor:
                card.color === 'blue'
                  ? '#3b82f6'
                  : card.color === 'green'
                    ? '#10b981'
                    : card.color === 'purple'
                      ? '#8b5cf6'
                      : '#f59e0b',
            }}
          >
            <h3 className="text-sm font-medium text-gray-600 mb-2">
              {card.title}
            </h3>
            <p className="text-3xl font-bold text-gray-900 mb-2">
              {card.value}
            </p>
            <p className="text-sm text-gray-500">{card.description}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/admin/questions"
            className="block p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <h4 className="font-medium text-gray-900 mb-1">
              Manage Questions
            </h4>
            <p className="text-sm text-gray-600">
              Create, update, or delete interview questions
            </p>
          </a>
          <a
            href="/admin/users"
            className="block p-4 border border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors"
          >
            <h4 className="font-medium text-gray-900 mb-1">Manage Users</h4>
            <p className="text-sm text-gray-600">
              View and manage user accounts
            </p>
          </a>
          <a
            href="/admin/sync"
            className="block p-4 border border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors"
          >
            <h4 className="font-medium text-gray-900 mb-1">GitHub Sync</h4>
            <p className="text-sm text-gray-600">
              Import questions from GitHub repositories
            </p>
          </a>
        </div>
      </div>
    </div>
  )
}
