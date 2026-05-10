import { NextResponse } from "next/server";

const CIRCLE_BASE_URL = "https://api.circle.com";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

async function proxyRequest(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await context.params;
    const requestUrl = new URL(request.url);
    const targetUrl = new URL(`${CIRCLE_BASE_URL}/${path.join("/")}`);
    targetUrl.search = requestUrl.search;

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("connection");
    headers.delete("content-length");

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: shouldSendBody(request.method) ? await request.text() : undefined,
      redirect: "follow",
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("access-control-allow-origin", "*");

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Circle proxy request failed.",
      },
      { status: 502 },
    );
  }
}

function shouldSendBody(method: string) {
  return !["GET", "HEAD"].includes(method.toUpperCase());
}
