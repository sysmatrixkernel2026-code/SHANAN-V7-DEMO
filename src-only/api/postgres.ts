import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error('SUPABASE_DB_URL is required');

export const sql = postgres(url,{max:5,connect_timeout:10,prepare:false});

export async function closePostgres(){
  await sql.end({timeout:5});
}

export async function getSessionUser(token:string){
  const rows=await sql`SELECT u.* FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token=${token} AND s.expires_at > NOW() LIMIT 1`;
  return (rows[0] as any) ?? null;
}

export async function createSession(token:string,userId:string,expiresAt:string){
  await sql`INSERT INTO user_sessions(token,user_id,expires_at) VALUES(${token},${userId},${expiresAt}) ON CONFLICT(token) DO UPDATE SET user_id=EXCLUDED.user_id,expires_at=EXCLUDED.expires_at`;
}

export async function deleteSession(token:string){
  await sql`DELETE FROM user_sessions WHERE token=${token}`;
}

export async function getUserByEmail(email:string){
  const rows=await sql`SELECT * FROM users WHERE email=${email} LIMIT 1`;
  return (rows[0] as any) ?? null;
}
