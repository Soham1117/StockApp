import asyncio
from twikit import Client

USERNAME = 'sohampatel1117'
EMAIL = 'sohampatel1117@gmail.com'
PASSWORD = 'ransom-mao-headset'

client = Client('en-US')

async def main():
    await client.login(
        auth_info_1=USERNAME,
        auth_info_2=EMAIL,
        password=PASSWORD,
        cookies_file='cookies.json'
    )

asyncio.run(main())