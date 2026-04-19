import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const data = JSON.parse(process.env.IMPORT_DATA || '[]')
    return NextResponse.json(data)
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}
