# Zeichnet die PNG-Icons nach den SVG-Vorlagen nach.
# Auf dem Rechner gibt es keinen SVG-Renderer, deshalb wird das Motiv hier
# mit System.Drawing noch einmal von Hand gezeichnet. Bei Logoaenderungen
# muessen icon.svg / icon-maskable.svg UND dieses Skript angepasst werden.

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$gruen  = [System.Drawing.ColorTranslator]::FromHtml("#3f7d4e")
$weiss  = [System.Drawing.Color]::White
$orange = [System.Drawing.ColorTranslator]::FromHtml("#dd8a2f")

function New-Icon {
    param(
        [int]$Size,           # Kantenlaenge in Pixel
        [string]$Datei,
        [double]$Anteil,      # Motivgroesse: Kreisradius im Verhaeltnis zur Kante
        [double]$EckenAnteil  # Eckenradius im Verhaeltnis zur Kante (0 = eckig)
    )

    $bild = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bild)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Hintergrundflaeche
    $pinsel = New-Object System.Drawing.SolidBrush($gruen)
    if ($EckenAnteil -gt 0) {
        $r = [int]($Size * $EckenAnteil)
        $pfad = New-Object System.Drawing.Drawing2D.GraphicsPath
        $pfad.AddArc(0, 0, 2*$r, 2*$r, 180, 90)
        $pfad.AddArc($Size-2*$r, 0, 2*$r, 2*$r, 270, 90)
        $pfad.AddArc($Size-2*$r, $Size-2*$r, 2*$r, 2*$r, 0, 90)
        $pfad.AddArc(0, $Size-2*$r, 2*$r, 2*$r, 90, 90)
        $pfad.CloseFigure()
        $g.FillPath($pinsel, $pfad)
        $pfad.Dispose()
    } else {
        $g.FillRectangle($pinsel, 0, 0, $Size, $Size)
    }
    $pinsel.Dispose()

    $mitte  = $Size / 2.0
    $radius = $Size * $Anteil

    # Teller als Ring
    $stift = New-Object System.Drawing.Pen($weiss, [float]($radius * 0.17))
    $g.DrawEllipse($stift, [float]($mitte-$radius), [float]($mitte-$radius), [float](2*$radius), [float](2*$radius))
    $stift.Dispose()

    # Hilfsfunktion: dicke Linie mit runden Enden
    $linie = {
        param($farbe, $staerke, $x1, $y1, $x2, $y2)
        $p = New-Object System.Drawing.Pen($farbe, [float]$staerke)
        $p.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $p.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
        $g.DrawLine($p, [float]$x1, [float]$y1, [float]$x2, [float]$y2)
        $p.Dispose()
    }

    # Gabel links im Teller: drei Zinken, die in einem Kopf zusammenlaufen, darunter der Stiel
    $gx = $mitte - $radius * 0.30
    foreach ($versatz in @(-0.17, 0, 0.17)) {
        $zx = $gx + $radius * $versatz
        & $linie $weiss ($radius*0.10) $zx ($mitte - $radius*0.58) $zx ($mitte - $radius*0.20)
    }
    & $linie $weiss ($radius*0.16) ($gx - $radius*0.17) ($mitte - $radius*0.18) ($gx + $radius*0.17) ($mitte - $radius*0.18)
    & $linie $weiss ($radius*0.14) $gx ($mitte - $radius*0.18) $gx ($mitte + $radius*0.52)

    # Messer rechts: breite Klinge, schmaler Griff
    $mx = $mitte + $radius * 0.34
    & $linie $weiss ($radius*0.17) $mx ($mitte - $radius*0.50) $mx ($mitte + $radius*0.02)
    & $linie $weiss ($radius*0.10) $mx ($mitte + $radius*0.06) $mx ($mitte + $radius*0.50)

    # Orangefarbener Akzent: kleiner Bissen zwischen Gabel und Messer
    $rp = $radius * 0.10
    $pinsel = New-Object System.Drawing.SolidBrush($orange)
    $g.FillEllipse($pinsel, [float]($mitte + $radius*0.02 - $rp), [float]($mitte + $radius*0.62 - $rp), [float](2*$rp), [float](2*$rp))
    $pinsel.Dispose()

    $g.Dispose()
    $ziel = Join-Path $root $Datei
    $bild.Save($ziel, [System.Drawing.Imaging.ImageFormat]::Png)
    $bild.Dispose()
    Write-Output "geschrieben: $Datei ($Size x $Size)"
}

# any-Icons: abgerundetes Quadrat, Motiv wie in icon.svg (Radius 160/512)
New-Icon -Size 192 -Datei "icon-192.png" -Anteil 0.3125 -EckenAnteil 0.215
New-Icon -Size 512 -Datei "icon-512.png" -Anteil 0.3125 -EckenAnteil 0.215

# maskable: vollflaechig, Motiv etwas kleiner damit es im Sicherheitskreis bleibt
New-Icon -Size 512 -Datei "icon-512-maskable.png" -Anteil 0.293 -EckenAnteil 0

# iOS legt seine eigene Maske darueber: eckig lassen, Motiv gross
New-Icon -Size 180 -Datei "apple-touch-icon.png" -Anteil 0.33 -EckenAnteil 0
