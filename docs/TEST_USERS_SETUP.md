# Test Users Setup Guide

This guide explains how to create test users for login/logout functionality.

## Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Authentication** → **Users**
4. Click **"Add user"** → **"Create new user"**
5. Fill in the details:
   - **Email**: `admin@test.com`
   - **Password**: `test123456`
   - **Auto Confirm User**: ✅ (check this box)
   - **User Metadata**: 
     ```json
     {
       "full_name": "Test Admin"
     }
     ```
6. Click **"Create user"**
7. Repeat for the second user:
   - **Email**: `user@test.com`
   - **Password**: `test123456`
   - **Auto Confirm User**: ✅
   - **User Metadata**: 
     ```json
     {
       "full_name": "Test User"
     }
     ```

**Note**: The trigger will automatically create profiles in `public.profiles` table when users are created.

## Option 2: Using the Script

Run the script:
```bash
node scripts/create-test-users.js
```

If you get "User not allowed" error, you may need to:
1. Enable email signups in Supabase Dashboard:
   - Go to **Authentication** → **Providers**
   - Enable **Email** provider
   - Save changes
2. Ensure your `SUPABASE_SERVICE_KEY` has admin permissions

## Option 3: Manual Signup via Application

1. Start your application: `npm start`
2. Navigate to Settings → Auth tab
3. Use the signup form to create test users
4. Check your email for confirmation (or disable email confirmation in Supabase settings)

## Test Credentials

After creating users, you can login with:

**Admin User:**
- Email: `admin@test.com`
- Password: `test123456`

**Regular User:**
- Email: `user@test.com`
- Password: `test123456`

## Verify Users Were Created

You can verify users were created by running this SQL in Supabase SQL Editor:

```sql
-- Check auth users
SELECT id, email, email_confirmed_at, created_at 
FROM auth.users 
WHERE email IN ('admin@test.com', 'user@test.com');

-- Check profiles (should be auto-created by trigger)
SELECT id, email, display_name, created_at 
FROM public.profiles 
WHERE email IN ('admin@test.com', 'user@test.com');
```

## Troubleshooting

### "User not allowed" Error
- Check that Email provider is enabled in Authentication → Providers
- Verify your `SUPABASE_SERVICE_KEY` is correct
- Ensure you're using the service role key, not the anon key

### Users Created But Can't Login
- Verify email confirmation is enabled/disabled as needed
- Check that the user's `email_confirmed_at` is set (or disable email confirmation)
- Ensure RLS policies allow the user to access their profile

### Profile Not Created
- Check that the trigger `on_auth_user_created` exists:
  ```sql
  SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
  ```
- Verify the trigger function exists:
  ```sql
  SELECT * FROM pg_proc WHERE proname = 'handle_new_user';
  ```

