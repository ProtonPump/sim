import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console-logger'
import { refreshOAuthToken } from '@/lib/oauth'
import { db } from '@/db'
import { account } from '@/db/schema'

const logger = createLogger('GmailLabelAPI')

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)

  try {
    // Get the session
    const session = await getSession()

    // Check if the user is authenticated
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthenticated label request rejected`)
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const credentialId = searchParams.get('credentialId')
    const labelId = searchParams.get('labelId')

    if (!credentialId || !labelId) {
      logger.warn(`[${requestId}] Missing required parameters`)
      return NextResponse.json(
        { error: 'Credential ID and Label ID are required' },
        { status: 400 }
      )
    }

    // Get the credential from the database
    const credentials = await db
      .select()
      .from(account)
      .where(and(eq(account.id, credentialId), eq(account.userId, session.user.id)))
      .limit(1)

    if (!credentials.length) {
      logger.warn(`[${requestId}] Credential not found`)
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    }

    const credential = credentials[0]

    // Log the credential info (without exposing sensitive data)
    logger.info(
      `[${requestId}] Using credential: ${credential.id}, provider: ${credential.providerId}`
    )

    // Check if we need to refresh the token
    const expiresAt = credential.accessTokenExpiresAt
    const now = new Date()
    const needsRefresh = !expiresAt || expiresAt <= now

    let accessToken = credential.accessToken

    if (needsRefresh && credential.refreshToken) {
      logger.info(`[${requestId}] Token expired, attempting to refresh`)
      try {
        const refreshedToken = await refreshOAuthToken(
          credential.providerId,
          credential.refreshToken
        )

        if (!refreshedToken) {
          logger.error(`[${requestId}] Failed to refresh token`)
          return NextResponse.json({ error: 'Failed to refresh access token' }, { status: 401 })
        }

        // Update the token in the database
        await db
          .update(account)
          .set({
            accessToken: refreshedToken,
            accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000), // Default 1 hour expiry
            updatedAt: new Date(),
          })
          .where(eq(account.id, credentialId))

        logger.info(`[${requestId}] Successfully refreshed access token`)
        accessToken = refreshedToken
      } catch (error) {
        logger.error(`[${requestId}] Error refreshing token:`, error)
        return NextResponse.json({ error: 'Failed to refresh access token' }, { status: 401 })
      }
    } else if (!accessToken) {
      logger.error(`[${requestId}] Missing access token for credential: ${credential.id}`)
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 })
    }

    // Fetch specific label from Gmail API
    logger.info(`[${requestId}] Fetching label ${labelId} from Gmail API`)
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/labels/${labelId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    // Log the response status
    logger.info(`[${requestId}] Gmail API response status: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`[${requestId}] Gmail API error response: ${errorText}`)

      try {
        const error = JSON.parse(errorText)
        return NextResponse.json({ error }, { status: response.status })
      } catch (e) {
        return NextResponse.json({ error: errorText }, { status: response.status })
      }
    }

    const label = await response.json()

    // Transform the label to a more usable format
    // Format the label name with proper capitalization
    let formattedName = label.name

    // Handle system labels (INBOX, SENT, etc.)
    if (label.type === 'system') {
      // Convert to title case (first letter uppercase, rest lowercase)
      formattedName = label.name.charAt(0).toUpperCase() + label.name.slice(1).toLowerCase()
    }

    const formattedLabel = {
      id: label.id,
      name: formattedName,
      type: label.type,
      messagesTotal: label.messagesTotal || 0,
      messagesUnread: label.messagesUnread || 0,
    }

    return NextResponse.json({ label: formattedLabel }, { status: 200 })
  } catch (error) {
    logger.error(`[${requestId}] Error fetching Gmail label:`, error)
    return NextResponse.json({ error: 'Failed to fetch Gmail label' }, { status: 500 })
  }
}
