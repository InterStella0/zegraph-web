'use client';

import { useState } from 'react';
import { Bell, Send } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Textarea } from 'components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/ui/card';
import {fetchApiUrl} from 'utils/generalUtils';
import { toast } from 'sonner';

interface SendResult {
  success: number;
  failed: number;
  total: number;
  errors: string[];
}

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState('Test Notification');
  const [body, setBody] = useState('This is a test notification from ZE Graph');
  const [userId, setUserId] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  const sendTestNotification = async () => {
    setSending(true);
    setResult(null);

    try {
      const payload = {
        title,
        body,
        user_id: userId ,
      };

      const data: SendResult = await fetchApiUrl('/admin/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      setResult(data);
      toast.success(`Sent to ${data.success} users`);
    } catch (error) {
      console.error('Failed to send test notification:', error);
      toast.error('Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Test Push Notifications</h1>
        <p className="text-muted-foreground">
          Send test notifications to users to verify the push notification system
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Send Test Notification
          </CardTitle>
          <CardDescription>
            Test the push notification system by sending a notification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Body</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Notification message"
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              User ID (optional - leave empty to send to all)
            </label>
            <Input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="76561198012345678"
              type="number"
            />
          </div>

          <Button
            onClick={sendTestNotification}
            disabled={sending || !title || !body}
            className="w-full"
          >
            <Send className="mr-2 h-4 w-4" />
            {sending ? 'Sending...' : 'Send Test Notification'}
          </Button>

          {result && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <h3 className="font-medium mb-2">Send Result:</h3>
              <ul className="text-sm space-y-1">
                <li>Total: {result.total}</li>
                <li className="text-green-600">Success: {result.success}</li>
                <li className="text-red-600">Failed: {result.failed}</li>
              </ul>
              {result.errors && result.errors.length > 0 && (
                <div className="mt-2">
                  <h4 className="font-medium text-sm">Errors:</h4>
                  <ul className="text-xs text-muted-foreground">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
