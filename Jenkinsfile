pipeline {
    // Jenkins runs on the deploy host (10.10.12.61): images are built and kept
    // locally, no registry, no SSH.
    agent any

    options {
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 30, unit: 'MINUTES')
    }

    environment {
        IMAGE_NAME     = 'free-wifi-portal'
        CONTAINER_NAME = 'free-wifi-portal'
        HOST_PORT      = '4520'

        // How many build-number tags to keep for rollback
        KEEP_IMAGES    = '3'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    def branch = sh(
                        script: "git branch -r --contains HEAD | head -1 | sed 's|origin/||' | xargs",
                        returnStdout: true
                    ).trim()

                    env.BRANCH = branch
                    echo "✅ Detected branch: ${env.BRANCH}"
                }
            }
        }

        stage('Lint') {
            steps {
                echo '🔍 Running lint...'
                // Bun is not installed on the host — run it from the same image the
                // Dockerfile uses. --user keeps node_modules owned by jenkins so
                // cleanWs() can delete it.
                sh '''
                    docker run --rm \
                        --user "$(id -u):$(id -g)" \
                        -e HOME=/tmp \
                        -v "$WORKSPACE":/app \
                        -w /app \
                        oven/bun:1.4.2-alpine \
                        sh -c 'bun install --frozen-lockfile && bun run lint' || true
                '''
            }
        }

        stage('Build Docker Image') {
            steps {
                echo '🐳 Building Docker image...'
                script {
                    def envFile = (env.BRANCH == 'uat') ? 'env.uat.text' : 'env.production.text'

                    sh """
                        docker build \
                            --build-arg ENV_FILE=${envFile} \
                            --build-arg APP_VERSION=${env.BUILD_NUMBER} \
                            -t "$IMAGE_NAME:$BUILD_NUMBER" \
                            -t "$IMAGE_NAME:latest" \
                            .
                    """
                }
            }
        }

        stage('Deploy') {
            when { expression { env.BRANCH == 'main' } }
            steps {
                echo '🚀 Deploying...'
                sh '''
                    set -eu

                    if [ ! -r "$ENV_FILE" ]; then
                        echo "❌ Env file not found or not readable: $ENV_FILE"
                        exit 1
                    fi

                    # Image of the running container, used for rollback
                    PREV_IMAGE=$(docker inspect -f '{{.Config.Image}}' "$CONTAINER_NAME" 2>/dev/null || true)

                    run_container() {
                        docker run -d --name "$CONTAINER_NAME" \
                            --restart unless-stopped \
                            --env-file "$ENV_FILE" \
                            --add-host host.docker.internal:host-gateway \
                            -p "$HOST_PORT:3000" \
                            "$1"
                    }

                    # HEALTHCHECK in the Dockerfile reports healthy/unhealthy
                    wait_healthy() {
                        for _ in $(seq 1 60); do
                            status=$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo missing)
                            case "$status" in
                                healthy) return 0 ;;
                                unhealthy|missing) return 1 ;;
                            esac
                            sleep 2
                        done
                        return 1
                    }

                    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
                    run_container "$IMAGE_NAME:$BUILD_NUMBER"

                    if wait_healthy; then
                        echo "✅ $CONTAINER_NAME is healthy on port $HOST_PORT"
                        exit 0
                    fi

                    echo "❌ New container failed health check, logs:"
                    docker logs --tail 100 "$CONTAINER_NAME" || true
                    docker rm -f "$CONTAINER_NAME" || true

                    if [ -n "$PREV_IMAGE" ]; then
                        echo "↩️  Rolling back to $PREV_IMAGE"
                        run_container "$PREV_IMAGE"
                    fi
                    exit 1
                '''
            }
        }

        stage('Cleanup') {
            steps {
                echo '🧹 Removing old images...'
                sh '''
                    # Keep the newest $KEEP_IMAGES build-number tags; images still
                    # used by a container fail to delete and are skipped
                    docker images "$IMAGE_NAME" --format '{{.Tag}}' \
                        | grep -E '^[0-9]+$' \
                        | sort -rn \
                        | tail -n +$((KEEP_IMAGES + 1)) \
                        | xargs -r -I{} docker rmi "$IMAGE_NAME:{}" || true

                    docker image prune -f
                '''
            }
        }
    }

    post {
        success {
            echo """
            ✅ Build & Deploy สำเร็จ!
            📦 Image: ${IMAGE_NAME}:${env.BUILD_NUMBER}
            🌿 Branch: ${env.BRANCH}
            """
        }
        failure {
            echo '❌ Build ล้มเหลว กรุณาตรวจสอบ logs'
        }
        always {
            cleanWs()
        }
    }
}
