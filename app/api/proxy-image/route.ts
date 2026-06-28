import { NextResponse } from 'next/server';
import { fetchImageAsBase64 } from '@/lib/image-proxy';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return new NextResponse('Missing url parameter', { status: 400 });
    }

    try {
        const base64 = await fetchImageAsBase64(url);
        return NextResponse.json({ base64 });
    } catch (error) {
        console.error('[PROXY-IMAGE] Erro:', error);
        return new NextResponse('Failed to proxy image', { status: 500 });
    }
}