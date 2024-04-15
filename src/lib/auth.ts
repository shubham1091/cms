import db from '@/db';
import CredentialsProvider from 'next-auth/providers/credentials';
import { SignJWT, importJWK } from 'jose';
import bcrypt from 'bcrypt';
import prisma from '@/db';
import { env } from '@/env';

interface AppxSigninResponse {
  data: {
    userid: string;
    name: string;
    username: string;
  };
}

const generateJWT = async (payload: any) => {
  const secret = env.JWT_SECRET || 'secret';

  const jwk = await importJWK({ k: secret, alg: 'HS256', kty: 'oct' });

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('365d')
    .sign(jwk);

  return jwt;
};
async function validateUser(
  email: string,
  password: string,
): Promise<
  | { data: null }
  | {
      data: {
        name: string;
        userid: string;
        token: string;
      };
    }
> {
  if (env.LOCAL_CMS_PROVIDER) {
    if (password === '123456') {
      return {
        data: {
          name: 'Random',
          userid: '1',
          token: '',
        },
      };
    }
    return { data: null };
  }
  const url = 'https://harkiratapi.classx.co.in/post/userLogin';
  const headers = {
    'Client-Service': env.APPX_CLIENT_SERVICE || '',
    'Auth-Key': env.APPX_AUTH_KEY || '',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const body = new URLSearchParams();
  body.append('email', email);
  body.append('password', password);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    return data as any; // Or process data as needed
  } catch (error) {
    console.error('Error validating user:', error);
  }
  return {
    data: null,
  };
}

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'email', type: 'text', placeholder: '' },
        password: { label: 'password', type: 'password', placeholder: '' },
      },
      async authorize(credentials: any) {
        try {
          if (env.LOCAL_CMS_PROVIDER) {
            return {
              id: '1',
              name: 'test',
              email: 'test@gmail.com',
              token: await generateJWT({
                id: '1',
              }),
            };
          }
          const hashedPassword = await bcrypt.hash(credentials.password, 10);

          const userDb = await prisma.user.findFirst({
            where: {
              email: credentials.username,
            },
            select: {
              password: true,
              id: true,
              name: true,
            },
          });
          if (
            userDb &&
            userDb.password &&
            (await bcrypt.compare(credentials.password, userDb.password))
          ) {
            const jwt = await generateJWT({
              id: userDb.id,
            });
            await db.user.update({
              where: {
                id: userDb.id,
              },
              data: {
                token: jwt,
              },
            });

            return {
              id: userDb.id,
              name: userDb.name,
              email: credentials.username,
              token: jwt,
            };
          }
          console.log('not in db');
          //@ts-ignore
          const user: AppxSigninResponse = await validateUser(
            credentials.username,
            credentials.password,
          );

          const jwt = await generateJWT({
            id: user.data.userid,
          });

          if (user.data) {
            try {
              await db.user.upsert({
                where: {
                  id: user.data.userid,
                },
                create: {
                  id: user.data.userid,
                  name: user.data.name,
                  email: credentials.username,
                  token: jwt,
                  password: hashedPassword,
                },
                update: {
                  id: user.data.userid,
                  name: user.data.name,
                  email: credentials.username,
                  token: jwt,
                  password: hashedPassword,
                },
              });
            } catch (e) {
              console.log(e);
            }

            return {
              id: user.data.userid,
              name: user.data.name,
              email: credentials.username,
              token: jwt,
            };
          }

          // Return null if user data could not be retrieved
          return null;
        } catch (e) {
          console.error(e);
        }
        return null;
      },
    }),
  ],
  secret: env.NEXTAUTH_SECRET || 'secr3t',
  callbacks: {
    session: async ({ session, token }: any) => {
      if (session?.user) {
        session.user.id = token.uid;
        session.user.jwtToken = token.jwtToken;
        session.user.role = env.ADMINS.split(',').includes(session.user.email)
          ? 'admin'
          : 'user';
      }

      return session;
    },
    jwt: async ({ user, token }: any) => {
      if (user) {
        token.uid = user.id;
        token.jwtToken = user.token;
      }
      return token;
    },
  },
  pages: {
    signIn: '/signin',
  },
};
