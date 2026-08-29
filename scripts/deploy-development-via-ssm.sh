#!/usr/bin/env bash
set -Eeuo pipefail

required_commands=(aws base64 jq)
for command_name in "${required_commands[@]}"; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  }
done

required_environment=(AWS_REGION EC2_INSTANCE_ID DEPLOY_PATH IMAGE_TAG API_IMAGE MIGRATOR_IMAGE)
for variable_name in "${required_environment[@]}"; do
  [[ -n "${!variable_name:-}" ]] || {
    echo "Required environment variable is missing: $variable_name" >&2
    exit 1
  }
done

[[ "$EC2_INSTANCE_ID" =~ ^i-[0-9a-f]{8,17}$ ]] || {
  echo 'EC2_INSTANCE_ID is invalid.' >&2
  exit 1
}
[[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]] || {
  echo 'IMAGE_TAG must be a full Git commit SHA.' >&2
  exit 1
}
[[ "$API_IMAGE" =~ ^[a-z0-9][a-z0-9._/-]*$ ]] || {
  echo 'API_IMAGE is invalid.' >&2
  exit 1
}
[[ "$MIGRATOR_IMAGE" =~ ^[a-z0-9][a-z0-9._/-]*$ ]] || {
  echo 'MIGRATOR_IMAGE is invalid.' >&2
  exit 1
}
[[ "$DEPLOY_PATH" == /* && "$DEPLOY_PATH" != '/' ]] || {
  echo 'DEPLOY_PATH must be an absolute directory below the filesystem root.' >&2
  exit 1
}

compose_base64="$(base64 --wrap=0 compose-prod.yaml)"

command_parameters="$(
  jq -n \
    --arg deploy_path "$DEPLOY_PATH" \
    --arg image_tag "$IMAGE_TAG" \
    --arg api_image "$API_IMAGE" \
    --arg migrator_image "$MIGRATOR_IMAGE" \
    --arg compose_base64 "$compose_base64" \
    '{
      commands: [
        "set -eu",
        ("DEPLOY_PATH=" + ($deploy_path | @sh)),
        ("IMAGE_TAG=" + ($image_tag | @sh)),
        ("API_IMAGE=" + ($api_image | @sh)),
        ("MIGRATOR_IMAGE=" + ($migrator_image | @sh)),
        ("COMPOSE_BASE64=" + ($compose_base64 | @sh)),
        "cd \"$DEPLOY_PATH\"",
        "test -f compose-prod.yaml",
        "test -f .env.production",
        "printf %s \"$COMPOSE_BASE64\" | base64 --decode | sudo tee compose-prod.yaml.next >/dev/null",
        "sudo env IMAGE_TAG=\"$IMAGE_TAG\" API_IMAGE=\"$API_IMAGE\" MIGRATOR_IMAGE=\"$MIGRATOR_IMAGE\" docker compose --env-file .env.production -f compose-prod.yaml.next config --quiet",
        "sudo cp compose-prod.yaml compose-prod.yaml.previous",
        "sudo mv compose-prod.yaml.next compose-prod.yaml",
        "compose() { sudo env IMAGE_TAG=\"$IMAGE_TAG\" API_IMAGE=\"$API_IMAGE\" MIGRATOR_IMAGE=\"$MIGRATOR_IMAGE\" docker compose --env-file .env.production -f compose-prod.yaml \"$@\"; }",
        "sudo docker pull \"$API_IMAGE:$IMAGE_TAG\"",
        "sudo docker pull \"$MIGRATOR_IMAGE:$IMAGE_TAG\"",
        "compose --profile migration run --rm --no-deps migrate",
        "compose up -d --no-deps --force-recreate api",
        "container_id=\"$(compose ps -q api)\"",
        "test -n \"$container_id\"",
        "healthy=false",
        "attempt=1",
        "while [ \"$attempt\" -le 36 ]; do status=\"$(sudo docker inspect --format \"{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}\" \"$container_id\")\"; if [ \"$status\" = healthy ]; then healthy=true; break; fi; if [ \"$status\" = exited ] || [ \"$status\" = dead ]; then break; fi; sleep 5; attempt=$((attempt + 1)); done",
        "if [ \"$healthy\" != true ]; then compose ps; compose logs --no-color --tail=150 api; exit 1; fi",
        "compose ps",
        "echo \"Deployment completed for $API_IMAGE:$IMAGE_TAG\""
      ]
    }'
)"

command_id="$(
  aws ssm send-command \
    --region "$AWS_REGION" \
    --instance-ids "$EC2_INSTANCE_ID" \
    --document-name AWS-RunShellScript \
    --comment "Deploy $API_IMAGE:$IMAGE_TAG" \
    --timeout-seconds 900 \
    --parameters "$command_parameters" \
    --query 'Command.CommandId' \
    --output text
)"

echo "SSM deployment command: $command_id"

print_invocation() {
  jq -r '
    "Status: \(.Status)\n--- stdout ---\n\(.StandardOutputContent // "")\n--- stderr ---\n\(.StandardErrorContent // "")"
  '
}

for ((attempt = 1; attempt <= 120; attempt += 1)); do
  set +e
  invocation="$(
    aws ssm get-command-invocation \
      --region "$AWS_REGION" \
      --command-id "$command_id" \
      --instance-id "$EC2_INSTANCE_ID" \
      --output json 2>&1
  )"
  invocation_exit=$?
  set -e

  if (( invocation_exit != 0 )); then
    if [[ "$invocation" == *InvocationDoesNotExist* ]]; then
      sleep 5
      continue
    fi
    echo "$invocation" >&2
    exit "$invocation_exit"
  fi

  status="$(jq -r '.Status' <<<"$invocation")"
  case "$status" in
    Success)
      print_invocation <<<"$invocation"
      exit 0
      ;;
    Pending | InProgress | Delayed)
      sleep 5
      ;;
    *)
      print_invocation <<<"$invocation" >&2
      exit 1
      ;;
  esac
done

echo 'SSM deployment did not finish within ten minutes.' >&2
aws ssm get-command-invocation \
  --region "$AWS_REGION" \
  --command-id "$command_id" \
  --instance-id "$EC2_INSTANCE_ID" \
  --output json | print_invocation >&2
exit 1
