# --- Stage 1: The Builder ---
FROM debian:bullseye as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential cmake git pkg-config \
    qtbase5-dev qttools5-dev qttools5-dev-tools qt5-qmake \
    qtmultimedia5-dev libqt5svg5-dev libqt5xmlpatterns5-dev \
    libavcodec-dev libavdevice-dev libavfilter-dev libavformat-dev \
    libavutil-dev libpostproc-dev libswresample-dev libswscale-dev \
    zlib1g-dev libbz2-dev && \
    rm -rf /var/lib/apt/lists/*

# Clone the QCTools source code (submodules include third-party deps)
RUN git clone --recurse-submodules https://github.com/MediaArea/QCTools.git /qctools_source

# Build the qctools CLI using qmake
WORKDIR /qctools_source/Project/QtCreator

RUN set -ex && \
    mkdir -p build/qctools-lib build/qctools-cli && \
    cd build/qctools-lib && \
    qmake ../../qctools-lib/qctools-lib.pro CONFIG+=release DEFINES+=QT_AVPLAYER_MULTIMEDIA FFMPEG=/usr && \
    make -j$(nproc) && \
    cd ../qctools-cli && \
    qmake ../../qctools-cli/qctools-cli.pro CONFIG+=release DEFINES+=QT_AVPLAYER_MULTIMEDIA FFMPEG=/usr && \
    make -j$(nproc)

# --- Stage 2: The Final Application Image ---
FROM python:3.9-slim-bullseye

# Install runtime dependencies (FFmpeg libs + Qt runtime for qcli)
RUN apt-get update && apt-get install -y \
    ffmpeg imagemagick \
    libavcodec58 libavdevice58 libavfilter7 libavformat58 \
    libswresample3 libswscale5 libavutil56 libpostproc55 \
    libqt5core5a libqt5network5 libqt5widgets5 libqt5gui5 libqt5xml5 libqt5svg5 \
    libqt5multimedia5 libqt5multimediawidgets5 libqt5multimedia5-plugins \
    libglib2.0-0 \
    tesseract-ocr \
  && rm -rf /var/lib/apt/lists/*

# Copy the compiled CLI binary and provide a qctools alias for compatibility
COPY --from=builder /qctools_source/Project/QtCreator/build/qctools-cli/qcli /usr/local/bin/qcli
RUN ln -s /usr/local/bin/qcli /usr/local/bin/qctools

# Set the working directory
WORKDIR /app

# Create resources and the reference image
RUN mkdir -p /app/resources
RUN convert -size 10x10 xc:"#0000FF" /app/resources/blue_ref.png

# Copy our Python application files
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ./*.py ./
COPY ./app/init_db.py ./

# Create the uploads directory
RUN mkdir -p /app/uploads
