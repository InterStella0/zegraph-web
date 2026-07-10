import {ImageResponse} from 'next/og'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

export const alt = 'ZE Graph - Zombie Escape Servers & Player Stats'
export const size = {width: 1200, height: 630}
export const contentType = 'image/png'

export default async function Image() {
    const iconData = await readFile(join(process.cwd(), 'public/icon-512x512.png'))
    const iconSrc = `data:image/png;base64,${iconData.toString('base64')}`
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#0A0A0A',
                    backgroundImage:
                        'radial-gradient(circle at 50% 35%, #2A0528 0%, #0A0A0A 70%)',
                    color: '#FFFFFF',
                    fontFamily: 'sans-serif',
                }}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={iconSrc}
                    width={168}
                    height={168}
                    alt=""
                    style={{
                        borderRadius: '9999px',
                        marginBottom: 28,
                        border: '4px solid #f48fb1',
                    }}
                />
                <div
                    style={{
                        display: 'flex',
                        fontSize: 96,
                        fontWeight: 700,
                        color: '#f48fb1',
                        letterSpacing: -2,
                    }}
                >
                    ZE Graph
                </div>
                <div
                    style={{
                        display: 'flex',
                        marginTop: 16,
                        fontSize: 44,
                        fontWeight: 600,
                        textAlign: 'center',
                        maxWidth: 900,
                    }}
                >
                    Zombie Escape Server &amp; Player Stats
                </div>
                <div
                    style={{
                        display: 'flex',
                        marginTop: 28,
                        fontSize: 30,
                        color: '#B9B4B8',
                        letterSpacing: 4,
                    }}
                >
                    CS2 · CS:GO · CS:S
                </div>
            </div>
        ),
        size,
    )
}
